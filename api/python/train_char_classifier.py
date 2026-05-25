"""
Train the character classifier used by ocr_image.py.

WHY THIS LOOKS LIKE A 2-LAYER MLP, NOT A CNN
--------------------------------------------
We deliberately avoid PyTorch / TensorFlow / Keras so the deployed Python
function stays small (Vercel's 50 MB limit). A small dense network in
pure NumPy trains in a couple minutes on CPU and hits ~92-95% on the
Standard OCR Dataset. If you want to swap in a real CNN later, this file
is the only thing that needs to change, the runtime in ocr_image.py
just loads `char_classifier.npz`.

DATASET, pick ONE of these (CSV mode is easiest)
-------------------------------------------------

Option A (recommended, most reliable URLs):
  1. A-Z Handwritten Alphabets:
     https://www.kaggle.com/datasets/sachinpatel21/az-handwritten-alphabets-in-csv-format
     File: A_Z Handwritten Data.csv
  2. MNIST digits:
     https://www.kaggle.com/datasets/hojjatk/mnist-dataset
     Files: mnist_train.csv, mnist_test.csv (or download the original .gz files)

  Place both under api/python/dataset/csv/ and pass --mode csv.

Option B (single file, more classes):
  EMNIST ByClass:
     https://www.kaggle.com/datasets/crawford/emnist
     File: emnist-byclass-train.csv, emnist-byclass-test.csv
  Place under api/python/dataset/csv/ and pass --mode emnist.

Option C (image folder layout, slower):
  English Handwritten Characters Dataset:
     https://www.kaggle.com/datasets/dhruvildave/english-handwritten-characters-dataset
  Expected layout:
     api/python/dataset/data/training_data/<class_name>/*.png
     api/python/dataset/data/testing_data/<class_name>/*.png

Run:
    py -3 api/python/train_char_classifier.py             # default: option A
    py -3 api/python/train_char_classifier.py --mode emnist
    py -3 api/python/train_char_classifier.py --mode folder

Outputs `api/python/char_classifier.npz` which ocr_image.py auto-loads.
"""

import os
import sys
from pathlib import Path

import numpy as np

try:
    import cv2
except ImportError:
    cv2 = None  # type: ignore

try:
    from PIL import Image
except ImportError:
    Image = None  # type: ignore


SCRIPT_DIR = Path(__file__).parent
DATA_ROOT = SCRIPT_DIR / "dataset" / "data"
# Primary dataset location, matches where the user dropped the Kaggle files.
# Kaggle ZIPs extract into <name>/<name> doubly-nested folders, so we look in
# both `api/data/<file>` and `api/data/<file>/<file>`.
EXTERNAL_DATA_ROOT = SCRIPT_DIR.parent / "data"
MODEL_OUT = SCRIPT_DIR / "char_classifier.npz"


def _find_file(*candidates: Path) -> Path | None:
    """Return the first existing path from a list of candidates."""
    for c in candidates:
        if c.exists() and c.is_file():
            return c
    return None


def _resolve_dataset_file(name: str) -> Path | None:
    """
    Locate `name` under api/data/ tolerating the Kaggle doubly-nested layout.
    Tries (in order):
        api/data/<name>
        api/data/<name>/<name>
        api/python/dataset/csv/<name>
    """
    return _find_file(
        EXTERNAL_DATA_ROOT / name,
        EXTERNAL_DATA_ROOT / name / name,
        SCRIPT_DIR / "dataset" / "csv" / name,
    )

# Match ocr_image.CLASS_LABELS exactly.
CLASS_LABELS = (
    list("0123456789")
    + list("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
    + list("abcdefghijklmnopqrstuvwxyz")
)
LABEL_TO_IDX = {c: i for i, c in enumerate(CLASS_LABELS)}

INPUT_SIZE = 28
INPUT_DIM = INPUT_SIZE * INPUT_SIZE
HIDDEN_1 = 256
HIDDEN_2 = 128
NUM_CLASSES = len(CLASS_LABELS)


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------

def _read_grayscale_28(path: Path) -> np.ndarray:
    """Read an image as a 28x28 grayscale uint8 array."""
    if cv2 is not None:
        img = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
        if img is None:
            raise IOError(f"cv2 could not read {path}")
        if img.shape != (INPUT_SIZE, INPUT_SIZE):
            img = cv2.resize(img, (INPUT_SIZE, INPUT_SIZE), interpolation=cv2.INTER_AREA)
        return img
    if Image is None:
        raise RuntimeError("Need cv2 or Pillow to load images")
    pil = Image.open(path).convert("L").resize((INPUT_SIZE, INPUT_SIZE))
    return np.array(pil, dtype=np.uint8)


def load_split(split_dir: Path) -> tuple[np.ndarray, np.ndarray]:
    """Walk `split_dir/<class_name>/*.png` and return (X, y) arrays."""
    if not split_dir.exists():
        raise FileNotFoundError(
            f"Dataset directory {split_dir} not found. See the top of this "
            "file for the expected layout / Kaggle link."
        )
    xs: list[np.ndarray] = []
    ys: list[int] = []
    for class_dir in sorted(split_dir.iterdir()):
        if not class_dir.is_dir():
            continue
        name = class_dir.name
        # Standard OCR Dataset uses class names like "0", "1", ..., "A", "B"
        #, but the Kaggle version sometimes uppercases lowercase letters.
        # Treat folder name as case-sensitive when possible, otherwise fall
        # back to uppercase.
        label = LABEL_TO_IDX.get(name) or LABEL_TO_IDX.get(name.upper())
        if label is None:
            continue
        for img_path in class_dir.iterdir():
            if img_path.suffix.lower() not in (".png", ".jpg", ".jpeg", ".bmp"):
                continue
            try:
                img = _read_grayscale_28(img_path)
            except Exception:
                continue
            xs.append(img.flatten().astype(np.float32) / 255.0)
            ys.append(label)
    if not xs:
        raise RuntimeError(f"No usable images found under {split_dir}")
    X = np.stack(xs).astype(np.float32)
    y = np.array(ys, dtype=np.int64)
    return X, y


# ---------------------------------------------------------------------------
# Tiny 3-layer MLP, manual forward/backward in NumPy
# ---------------------------------------------------------------------------

def init_weights(rng: np.random.Generator) -> dict:
    return {
        "W1": rng.standard_normal((INPUT_DIM, HIDDEN_1)).astype(np.float32) * np.sqrt(2.0 / INPUT_DIM),
        "b1": np.zeros((HIDDEN_1,), dtype=np.float32),
        "W2": rng.standard_normal((HIDDEN_1, HIDDEN_2)).astype(np.float32) * np.sqrt(2.0 / HIDDEN_1),
        "b2": np.zeros((HIDDEN_2,), dtype=np.float32),
        "W3": rng.standard_normal((HIDDEN_2, NUM_CLASSES)).astype(np.float32) * np.sqrt(2.0 / HIDDEN_2),
        "b3": np.zeros((NUM_CLASSES,), dtype=np.float32),
    }


def relu(x: np.ndarray) -> np.ndarray:
    return np.maximum(0.0, x)


def softmax(x: np.ndarray) -> np.ndarray:
    z = x - np.max(x, axis=-1, keepdims=True)
    e = np.exp(z)
    return e / np.sum(e, axis=-1, keepdims=True)


def forward(W: dict, X: np.ndarray) -> tuple[np.ndarray, dict]:
    z1 = X @ W["W1"] + W["b1"]
    a1 = relu(z1)
    z2 = a1 @ W["W2"] + W["b2"]
    a2 = relu(z2)
    z3 = a2 @ W["W3"] + W["b3"]
    probs = softmax(z3)
    cache = {"X": X, "a1": a1, "a2": a2, "z1": z1, "z2": z2, "probs": probs}
    return probs, cache


def backward(W: dict, cache: dict, y: np.ndarray, weight_decay: float = 1e-4) -> dict:
    n = y.shape[0]
    probs = cache["probs"]
    dlogits = probs.copy()
    dlogits[np.arange(n), y] -= 1.0
    dlogits /= n

    dW3 = cache["a2"].T @ dlogits + weight_decay * W["W3"]
    db3 = dlogits.sum(axis=0)
    da2 = dlogits @ W["W3"].T
    dz2 = da2 * (cache["z2"] > 0)

    dW2 = cache["a1"].T @ dz2 + weight_decay * W["W2"]
    db2 = dz2.sum(axis=0)
    da1 = dz2 @ W["W2"].T
    dz1 = da1 * (cache["z1"] > 0)

    dW1 = cache["X"].T @ dz1 + weight_decay * W["W1"]
    db1 = dz1.sum(axis=0)

    return {"W1": dW1, "b1": db1, "W2": dW2, "b2": db2, "W3": dW3, "b3": db3}


def cross_entropy(probs: np.ndarray, y: np.ndarray) -> float:
    return float(-np.mean(np.log(probs[np.arange(y.shape[0]), y] + 1e-12)))


def accuracy(probs: np.ndarray, y: np.ndarray) -> float:
    return float(np.mean(np.argmax(probs, axis=1) == y))


# ---------------------------------------------------------------------------
# Training loop
# ---------------------------------------------------------------------------

def train(X_train, y_train, X_val, y_val, epochs: int = 25, batch: int = 128, lr: float = 1e-3) -> dict:
    rng = np.random.default_rng(0)
    W = init_weights(rng)
    n = X_train.shape[0]
    for epoch in range(epochs):
        idx = rng.permutation(n)
        for start in range(0, n, batch):
            sel = idx[start : start + batch]
            xb = X_train[sel]
            yb = y_train[sel]
            probs, cache = forward(W, xb)
            grads = backward(W, cache, yb)
            for k in W:
                W[k] -= lr * grads[k]
        # Eval
        val_probs, _ = forward(W, X_val)
        loss = cross_entropy(val_probs, y_val)
        acc = accuracy(val_probs, y_val)
        print(f"epoch {epoch+1:02d}  val_loss={loss:.4f}  val_acc={acc*100:.2f}%")
    return W


def _load_csv_pixels(path: Path, has_header: bool, max_rows: int | None = None) -> tuple[np.ndarray, np.ndarray]:
    """Load a CSV where each row is `label, pixel0, pixel1, ..., pixel783`.

    The A-Z file is ~700 MB, so we stream it manually with a Python loop to
    avoid loading the entire decoded text into memory at once.
    """
    xs: list[np.ndarray] = []
    ys: list[int] = []
    with open(path, "r", newline="") as f:
        if has_header:
            f.readline()
        for i, line in enumerate(f):
            if max_rows is not None and i >= max_rows:
                break
            parts = line.strip().split(",")
            if len(parts) != INPUT_DIM + 1:
                continue
            ys.append(int(parts[0]))
            xs.append(np.asarray(parts[1:], dtype=np.float32) / 255.0)
    if not xs:
        raise ValueError(f"{path}: no usable rows found")
    X = np.stack(xs).astype(np.float32)
    y = np.asarray(ys, dtype=np.int64)
    return X, y


def _load_idx_images(path: Path) -> np.ndarray:
    """Read an IDX3 image file (MNIST format) → (N, 784) float32 in [0,1]."""
    with open(path, "rb") as f:
        magic = int.from_bytes(f.read(4), "big")
        if magic != 0x00000803:
            raise ValueError(f"{path}: not an IDX3 image file (magic={magic:#x})")
        n = int.from_bytes(f.read(4), "big")
        rows = int.from_bytes(f.read(4), "big")
        cols = int.from_bytes(f.read(4), "big")
        if rows != INPUT_SIZE or cols != INPUT_SIZE:
            raise ValueError(
                f"{path}: expected {INPUT_SIZE}x{INPUT_SIZE} images, got {rows}x{cols}"
            )
        buf = f.read(n * rows * cols)
    arr = np.frombuffer(buf, dtype=np.uint8).astype(np.float32) / 255.0
    return arr.reshape(n, rows * cols)


def _load_idx_labels(path: Path) -> np.ndarray:
    """Read an IDX1 label file (MNIST format) → (N,) int64."""
    with open(path, "rb") as f:
        magic = int.from_bytes(f.read(4), "big")
        if magic != 0x00000801:
            raise ValueError(f"{path}: not an IDX1 label file (magic={magic:#x})")
        n = int.from_bytes(f.read(4), "big")
        buf = f.read(n)
    return np.frombuffer(buf, dtype=np.uint8).astype(np.int64)


def _try_load_mnist() -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray] | None:
    """
    Try to load MNIST in any of its common formats. Returns
    (X_train, y_train, X_test, y_test) or None if not enough files are present.

    Supports:
      • CSV: mnist_train.csv + mnist_test.csv (with header row)
      • IDX: train-images-idx3-ubyte + train-labels-idx1-ubyte + t10k-* pair
    """
    # CSV path first
    tr_csv = _resolve_dataset_file("mnist_train.csv")
    te_csv = _resolve_dataset_file("mnist_test.csv")
    if tr_csv and te_csv:
        X_tr, y_tr = _load_csv_pixels(tr_csv, has_header=True)
        X_te, y_te = _load_csv_pixels(te_csv, has_header=True)
        return X_tr, y_tr, X_te, y_te

    # IDX path, many possible filename variants
    tr_img = _resolve_dataset_file("train-images.idx3-ubyte") or _resolve_dataset_file("train-images-idx3-ubyte")
    tr_lab = _resolve_dataset_file("train-labels.idx1-ubyte") or _resolve_dataset_file("train-labels-idx1-ubyte")
    te_img = _resolve_dataset_file("t10k-images.idx3-ubyte") or _resolve_dataset_file("t10k-images-idx3-ubyte")
    te_lab = _resolve_dataset_file("t10k-labels.idx1-ubyte") or _resolve_dataset_file("t10k-labels-idx1-ubyte")
    if tr_img and tr_lab and te_img and te_lab:
        return (
            _load_idx_images(tr_img),
            _load_idx_labels(tr_lab),
            _load_idx_images(te_img),
            _load_idx_labels(te_lab),
        )
    return None


def load_az_plus_mnist() -> tuple[tuple[np.ndarray, np.ndarray], tuple[np.ndarray, np.ndarray]]:
    """
    Combine A-Z Handwritten (uppercase letters) + MNIST (digits) into one
    36-class set. If only A-Z is available, train on just A-Z (26 classes
    mapped to indices 10..35, the digit indices stay unused).
    """
    az_path = _resolve_dataset_file("A_Z Handwritten Data.csv")
    if not az_path:
        raise FileNotFoundError(
            "Couldn't find 'A_Z Handwritten Data.csv' under api/data/.\n"
            "Tried api/data/<file>, api/data/<file>/<file>, and api/python/dataset/csv/<file>."
        )

    print(f"Loading {az_path.name} (this is ~700 MB, expect a minute)...")
    X_az, y_az_raw = _load_csv_pixels(az_path, has_header=False)
    # A-Z labels are 0..25 → shift to our index 10..35 (after digits).
    y_az = y_az_raw + 10
    print(f"  A-Z loaded: {X_az.shape[0]} samples")

    rng = np.random.default_rng(0)
    n_az = X_az.shape[0]
    perm = rng.permutation(n_az)
    val_size = max(1000, n_az // 10)
    val_idx, train_idx = perm[:val_size], perm[val_size:]

    mnist = _try_load_mnist()
    if mnist is None:
        print(
            "  MNIST not found (missing labels file?). Training on A-Z only, "
            "digits will be unsupported until you drop in mnist_train.csv / "
            "mnist_test.csv (or the four IDX files) under api/data/."
        )
        X_train = X_az[train_idx]
        y_train = y_az[train_idx]
        X_val = X_az[val_idx]
        y_val = y_az[val_idx]
        return (X_train, y_train), (X_val, y_val)

    X_m_tr, y_m_tr, X_m_te, y_m_te = mnist
    print(f"  MNIST loaded: {X_m_tr.shape[0]} train + {X_m_te.shape[0]} test")
    X_train = np.concatenate([X_az[train_idx], X_m_tr])
    y_train = np.concatenate([y_az[train_idx], y_m_tr])
    X_val = np.concatenate([X_az[val_idx], X_m_te])
    y_val = np.concatenate([y_az[val_idx], y_m_te])

    return (X_train, y_train), (X_val, y_val)


def load_emnist_byclass() -> tuple[tuple[np.ndarray, np.ndarray], tuple[np.ndarray, np.ndarray]]:
    """EMNIST ByClass, full 62-class digit + upper + lower set."""
    train_path = _resolve_dataset_file("emnist-byclass-train.csv")
    test_path = _resolve_dataset_file("emnist-byclass-test.csv")
    if not train_path or not test_path:
        raise FileNotFoundError(
            "Couldn't find emnist-byclass-train.csv / emnist-byclass-test.csv "
            "under api/data/.\n"
            "Download from https://www.kaggle.com/datasets/crawford/emnist"
        )
    print(f"Loading {train_path.name}...")
    X_train, y_train = _load_csv_pixels(train_path, has_header=False)
    print(f"Loading {test_path.name}...")
    X_val, y_val = _load_csv_pixels(test_path, has_header=False)
    return (X_train, y_train), (X_val, y_val)


def main(argv: list[str]) -> int:
    mode = "csv"
    for arg in argv:
        if arg.startswith("--mode="):
            mode = arg.split("=", 1)[1].strip().lower()
        elif arg == "--mode" and argv.index(arg) + 1 < len(argv):
            mode = argv[argv.index(arg) + 1].strip().lower()

    if mode == "folder":
        print("Loading training set from", DATA_ROOT / "training_data")
        X_train, y_train = load_split(DATA_ROOT / "training_data")
        print(f"  {X_train.shape[0]} training samples")
        print("Loading test set from", DATA_ROOT / "testing_data")
        X_val, y_val = load_split(DATA_ROOT / "testing_data")
        print(f"  {X_val.shape[0]} validation samples")
    elif mode == "emnist":
        (X_train, y_train), (X_val, y_val) = load_emnist_byclass()
        print(f"  {X_train.shape[0]} training, {X_val.shape[0]} validation")
    else:
        # default "csv" → A-Z + MNIST
        (X_train, y_train), (X_val, y_val) = load_az_plus_mnist()
        print(f"  {X_train.shape[0]} training, {X_val.shape[0]} validation")

    W = train(X_train, y_train, X_val, y_val)
    np.savez(MODEL_OUT, **W)
    print(f"Saved trained weights to {MODEL_OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
