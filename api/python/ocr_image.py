"""
OCR Image — detect alphanumeric characters in an image and (optionally)
classify them with a custom-trained CNN.

Pipeline:
    1. Decode image (PNG / JPEG / etc.) from base64.
    2. Grayscale + adaptive threshold + morphological cleanup.
    3. Connected-component analysis with MSER fallback to find candidate
       character regions.
    4. Filter regions by size / aspect ratio (typical character bounds).
    5. For each region, crop, normalize to 28x28, and (if the model is
       trained) classify with the local char classifier.
    6. Return per-region bboxes + predicted char + confidence.

No external AI API and no pretrained OCR engine is used. The classical CV
pipeline is enough to *detect* alphanumeric regions; the small CNN
(trained separately via train_char_classifier.py on a Kaggle dataset)
provides the character labels.

If the trained model isn't on disk yet, the endpoint still returns the
bboxes so the frontend can cover the regions — the labels just default
to "?". When the user types their answer the frontend can grade against
that placeholder or skip grading.
"""

from http.server import BaseHTTPRequestHandler
import base64
import io
import json
import os

import numpy as np

try:
    import cv2  # opencv-python-headless
except ImportError:
    cv2 = None  # type: ignore

try:
    from PIL import Image
except ImportError:
    Image = None  # type: ignore


# ---------------------------------------------------------------------------
# Model loading (lazy, optional)
# ---------------------------------------------------------------------------

MODEL_PATH = os.path.join(os.path.dirname(__file__), "char_classifier.npz")

# Class labels used by the training script. 62 classes:
#   0-9   -> indices 0-9
#   A-Z   -> indices 10-35
#   a-z   -> indices 36-61
CLASS_LABELS = (
    list("0123456789")
    + list("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
    + list("abcdefghijklmnopqrstuvwxyz")
)


_model_cache = {"loaded": False, "weights": None}


def _load_model():
    """Lazily load the trained CNN weights. Returns None if unavailable."""
    if _model_cache["loaded"]:
        return _model_cache["weights"]
    _model_cache["loaded"] = True
    if not os.path.exists(MODEL_PATH):
        return None
    try:
        weights = np.load(MODEL_PATH)
        _model_cache["weights"] = {
            "W1": weights["W1"],
            "b1": weights["b1"],
            "W2": weights["W2"],
            "b2": weights["b2"],
            "W3": weights["W3"],
            "b3": weights["b3"],
        }
        return _model_cache["weights"]
    except Exception:
        return None


def _relu(x: np.ndarray) -> np.ndarray:
    return np.maximum(0.0, x)


def _softmax(x: np.ndarray) -> np.ndarray:
    z = x - np.max(x, axis=-1, keepdims=True)
    e = np.exp(z)
    return e / np.sum(e, axis=-1, keepdims=True)


def _classify_char(img28: np.ndarray) -> tuple[str, float]:
    """Run the small MLP on a flattened 28x28 grayscale image."""
    model = _load_model()
    if model is None:
        return "?", 0.0

    x = img28.astype(np.float32).reshape(1, -1) / 255.0  # (1, 784)
    h1 = _relu(x @ model["W1"] + model["b1"])
    h2 = _relu(h1 @ model["W2"] + model["b2"])
    logits = h2 @ model["W3"] + model["b3"]
    probs = _softmax(logits)[0]
    idx = int(np.argmax(probs))
    if idx >= len(CLASS_LABELS):
        return "?", 0.0
    return CLASS_LABELS[idx], float(probs[idx])


# ---------------------------------------------------------------------------
# Classical CV detection
# ---------------------------------------------------------------------------

def _decode_image(image_bytes: bytes) -> np.ndarray:
    """Decode PNG/JPEG/etc bytes into a BGR numpy array."""
    if cv2 is not None:
        arr = np.frombuffer(image_bytes, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Could not decode image")
        return img
    if Image is None:
        raise RuntimeError("Neither cv2 nor Pillow is available")
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    return np.array(img)[..., ::-1]  # to BGR


def _detect_char_regions(img_bgr: np.ndarray) -> list[tuple[int, int, int, int]]:
    """
    Find candidate single-character bounding boxes using contours on a
    cleaned binary image. Returns list of (x, y, w, h).
    """
    if cv2 is None:
        return []

    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    h_img, w_img = gray.shape[:2]

    # Adaptive threshold handles both light-on-dark and dark-on-light text
    # better than a fixed cutoff. Invert so text is white on black for the
    # contour finder.
    binary = cv2.adaptiveThreshold(
        gray,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        15,
        9,
    )

    # Small dilation joins broken strokes (e.g. dotted "i") into one blob.
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
    binary = cv2.dilate(binary, kernel, iterations=1)

    contours, _ = cv2.findContours(
        binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
    )

    regions: list[tuple[int, int, int, int]] = []
    for c in contours:
        x, y, w, h = cv2.boundingRect(c)
        # Heuristic filters: drop noise, drop full-page blobs.
        if h < 10 or w < 4:
            continue
        if h > h_img * 0.6 or w > w_img * 0.6:
            continue
        aspect = w / float(h)
        if aspect > 3.0 or aspect < 0.1:
            continue
        regions.append((x, y, w, h))

    # Sort top-to-bottom, then left-to-right (reading order).
    regions.sort(key=lambda r: (round(r[1] / 15), r[0]))
    return regions


def _crop_normalize(gray: np.ndarray, bbox: tuple[int, int, int, int]) -> np.ndarray:
    """Crop the region and resize to a centered 28x28 grayscale image."""
    if cv2 is None:
        return np.zeros((28, 28), dtype=np.uint8)
    x, y, w, h = bbox
    crop = gray[y : y + h, x : x + w]
    # Keep aspect ratio: fit into 20x20, pad to 28x28.
    side = max(w, h)
    scale = 20.0 / side
    new_w = max(1, int(round(w * scale)))
    new_h = max(1, int(round(h * scale)))
    resized = cv2.resize(crop, (new_w, new_h), interpolation=cv2.INTER_AREA)
    canvas = np.full((28, 28), 255, dtype=np.uint8)  # white background
    off_x = (28 - new_w) // 2
    off_y = (28 - new_h) // 2
    canvas[off_y : off_y + new_h, off_x : off_x + new_w] = resized
    return canvas


def ocr_image(image_bytes: bytes) -> dict:
    """Main entry point: decode → detect → classify → return JSON-ready dict."""
    if cv2 is None:
        return {
            "error": (
                "OpenCV is not installed in this environment. Install "
                "opencv-python-headless to enable image OCR."
            )
        }
    img = _decode_image(image_bytes)
    h_img, w_img = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    bboxes = _detect_char_regions(img)

    regions = []
    for bbox in bboxes:
        x, y, w, h = bbox
        norm = _crop_normalize(gray, bbox)
        char, conf = _classify_char(norm)
        regions.append({
            "bbox": [int(x), int(y), int(w), int(h)],
            "char": char,
            "confidence": round(conf, 3),
        })

    return {
        "width": int(w_img),
        "height": int(h_img),
        "regions": regions,
        "model_loaded": _load_model() is not None,
    }


# ---------------------------------------------------------------------------
# Vercel handler
# ---------------------------------------------------------------------------

class handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):  # noqa: A002
        pass

    def _send_json(self, status: int, body: dict):
        payload = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length)
            data = json.loads(raw)
            image_b64 = data.get("image_base64", "")
            if not image_b64:
                self._send_json(400, {"error": "Missing image_base64 field"})
                return
            # Strip data-URL prefix if present
            if "," in image_b64 and image_b64.startswith("data:"):
                image_b64 = image_b64.split(",", 1)[1]
            image_bytes = base64.b64decode(image_b64)
            result = ocr_image(image_bytes)
            self._send_json(200, result)
        except json.JSONDecodeError:
            self._send_json(400, {"error": "Invalid JSON"})
        except Exception as e:
            self._send_json(500, {"error": str(e)})
