import { createClient } from "@/lib/supabase/client";

export type StoredUpload = {
  bucket: string;
  path: string;
  name: string;
  type: string;
  size: number;
};

export type UploadPurpose = "quiz" | "flashcard" | "material";

/**
 * Upload a file STRAIGHT to Supabase Storage from the browser, bypassing the
 * Vercel function (whose request body is capped at ~4.5 MB). We first ask our
 * own API for a short-lived signed upload URL (server-authorized), then PUT the
 * bytes directly to Supabase. The caller then sends only the returned
 * {bucket, path} reference to the generate/share API.
 */
export async function uploadToStorage(
  file: File,
  purpose: UploadPurpose,
): Promise<StoredUpload> {
  const signRes = await fetch("/api/uploads/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type,
      size: file.size,
      purpose,
    }),
  });
  if (!signRes.ok) {
    const b = await signRes.json().catch(() => ({}));
    throw new Error(b.error || "Could not start the upload.");
  }
  const { bucket, path, token } = (await signRes.json()) as {
    bucket: string;
    path: string;
    token: string;
  };

  const supabase = createClient();
  const { error } = await supabase.storage
    .from(bucket)
    .uploadToSignedUrl(path, token, file, {
      contentType: file.type || undefined,
    });
  if (error) {
    throw new Error(error.message || "Upload failed. Please try again.");
  }

  return { bucket, path, name: file.name, type: file.type, size: file.size };
}
