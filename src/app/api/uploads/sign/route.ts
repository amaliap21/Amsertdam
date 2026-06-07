import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/get-user-id";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { MAX_UPLOAD_BYTES, UPLOAD_BUCKETS } from "@/lib/storage-uploads";

export const runtime = "nodejs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabaseAdmin as any;

// Per-purpose bucket + visibility. Generation files are transient and private
// (only the server reads them, then deletes); shared materials are public so
// recipients can open the PDF link.
const PURPOSE_CONFIG: Record<
  string,
  { bucket: string; public: boolean; folder: string }
> = {
  quiz: { bucket: UPLOAD_BUCKETS.transient, public: false, folder: "gen" },
  flashcard: { bucket: UPLOAD_BUCKETS.transient, public: false, folder: "gen" },
  material: { bucket: UPLOAD_BUCKETS.materials, public: true, folder: "shared-materials" },
};

const ensured = new Set<string>();
async function ensureBucket(bucket: string, isPublic: boolean) {
  if (ensured.has(bucket)) return;
  const { data } = await db.storage.getBucket(bucket);
  if (!data) {
    await db.storage.createBucket(bucket, {
      public: isPublic,
      fileSizeLimit: MAX_UPLOAD_BYTES,
    });
  }
  ensured.add(bucket);
}

/**
 * Issue a signed upload URL so the browser can PUT the file STRAIGHT to Supabase
 * Storage, bypassing the Vercel function's ~4.5 MB request-body cap. The path
 * embeds the user id so the reader routes can verify ownership later.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUserId();
  if (auth.response) return auth.response;
  const { userId } = auth;

  try {
    const body = await req.json().catch(() => ({}));
    const filename = String(body.filename ?? "file");
    const purpose = String(body.purpose ?? "");
    const size = Number(body.size ?? 0);

    const cfg = PURPOSE_CONFIG[purpose];
    if (!cfg) {
      return NextResponse.json({ error: "Invalid upload purpose." }, { status: 400 });
    }
    if (Number.isFinite(size) && size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "File exceeds the 50 MB limit." },
        { status: 413 },
      );
    }

    await ensureBucket(cfg.bucket, cfg.public);

    const safe = filename
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+/, "")
      .slice(-80) || "file";
    const path = `${cfg.folder}/${userId}/${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}-${safe}`;

    const { data, error } = await db.storage
      .from(cfg.bucket)
      .createSignedUploadUrl(path);
    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "Could not start the upload." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      bucket: cfg.bucket,
      path: data.path ?? path,
      token: data.token,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload sign failed." },
      { status: 500 },
    );
  }
}
