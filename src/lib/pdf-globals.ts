// Polyfill the browser-only globals that pdfjs-dist (loaded via pdf-parse)
// expects: DOMMatrix, DOMPoint, DOMRect, Path2D, ImageData, Image. Without
// these, importing pdf-parse on Node throws "ReferenceError: DOMMatrix is not
// defined" before our route code even runs.
//
// Import this module BEFORE importing pdf-parse so the globals are in place.
// @napi-rs/canvas ships native bindings for all of them.

import * as canvas from "@napi-rs/canvas";

type GlobalLike = Record<string, unknown>;
const g = globalThis as GlobalLike;

const install = (name: string, value: unknown) => {
  if (typeof g[name] === "undefined" && value) g[name] = value;
};

install("DOMMatrix", canvas.DOMMatrix);
install("DOMPoint", canvas.DOMPoint);
install("DOMRect", canvas.DOMRect);
install("Path2D", canvas.Path2D);
install("ImageData", canvas.ImageData);
install("Image", canvas.Image);

export {};
