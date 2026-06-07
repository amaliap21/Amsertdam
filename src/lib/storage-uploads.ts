import { supabaseAdmin } from "@/lib/supabase/admin";

// Server-side helpers for the "direct-to-Storage" upload flow. The browser
// uploads the file straight to Supabase Storage (bypassing the Vercel function,
// which caps request bodies at ~4.5 MB), then sends only a {bucket, path}
// reference. These helpers read that reference back with the service role.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabaseAdmin as any;

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB

// Buckets we allow API routes to read from. `uploads` holds transient files for
// quiz/flashcard generation (deleted after use); `shared-materials` holds the
// PDFs users share with mutuals (kept, served via public URL).
export const UPLOAD_BUCKETS = {
  transient: "uploads",
  materials: "shared-materials",
} as const;

/**
 * Validate that a {bucket, path} reference is one this server issued for THIS
 * user. The signer always embeds `/<userId>/` in the path, so a user can't
 * point the reader at someone else's object. Returns true when safe to read.
 */
export function ownsStoragePath(
  bucket: string,
  path: string,
  userId: string,
  allowedBuckets: readonly string[],
): boolean {
  if (!bucket || !path) return false;
  if (!allowedBuckets.includes(bucket)) return false;
  return path.includes(`/${userId}/`);
}

/**
 * Download a stored object and return it shaped like the `File` the rest of the
 * pipeline expects (it only reads .name / .type / .size / .arrayBuffer()).
 */
export async function downloadStoredFile(
  bucket: string,
  path: string,
  name: string,
  type: string,
): Promise<File> {
  const { data, error } = await db.storage.from(bucket).download(path);
  if (error || !data) {
    throw new Error(error?.message || "Could not read the uploaded file from storage.");
  }
  const blob = data as Blob;
  const ab = await blob.arrayBuffer();
  const finalType = type || blob.type || "application/octet-stream";
  // Node 20 (the route runtime) has a global File; use it so `instanceof File`
  // and File-specific helpers keep working downstream.
  if (typeof File !== "undefined") {
    return new File([ab], name, { type: finalType });
  }
  // Fallback: augment the Blob with a name so it duck-types as a File.
  Object.defineProperty(blob, "name", { value: name, configurable: true });
  return blob as unknown as File;
}

/** Best-effort cleanup of a transient upload. Never throws. */
export async function deleteStoredFile(bucket: string, path: string): Promise<void> {
  try {
    await db.storage.from(bucket).remove([path]);
  } catch {
    // ignore — orphaned transient files are harmless and can be lifecycle-purged
  }
}
