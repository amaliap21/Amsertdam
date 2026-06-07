import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getUserId } from "@/lib/get-user-id";
import { getMutualIds } from "@/lib/social";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabaseAdmin as any;

// GET — materials shared WITH me, plus what I've shared.
export async function GET() {
  try {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: received } = await db
      .from("resource_shares")
      .select("id, owner_id, kind, ref_id, title, url, note, created_at")
      .eq("recipient_id", userId)
      .order("created_at", { ascending: false })
      .limit(60);
    const { data: sent } = await db
      .from("resource_shares")
      .select("id, recipient_id, kind, ref_id, title, url, note, created_at")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false })
      .limit(60);

    const partyIds = [
      ...new Set([
        ...(received ?? []).map((r: { owner_id: string }) => r.owner_id),
        ...(sent ?? []).map((r: { recipient_id: string }) => r.recipient_id),
      ]),
    ];
    const { data: profs } = partyIds.length
      ? await db.from("profiles").select("id, full_name, avatar_url").in("id", partyIds)
      : { data: [] };
    const pmap = new Map((profs ?? []).map((p: { id: string }) => [p.id, p]));

    return NextResponse.json({
      received: (received ?? []).map((r: Record<string, unknown>) => ({ ...r, from: pmap.get(r.owner_id as string) ?? null })),
      sent: (sent ?? []).map((r: Record<string, unknown>) => ({ ...r, to: pmap.get(r.recipient_id as string) ?? null })),
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// POST { recipient_id, kind, ref_id?, title, url?, note? } — share with a mutual.
export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const kind = String(form.get("kind") ?? "material");
      const title = String(form.get("title") ?? "").trim();
      const note = form.get("note") ? String(form.get("note")) : null;
      const rawRecipients = form.get("recipient_ids");
      const recipientList = form.getAll("recipient_ids").filter((r): r is string => typeof r === "string");
      let recipients: string[] = [];
      if (recipientList.length) {
        const single = recipientList.length === 1 ? recipientList[0] : null;
        if (single && single.trim().startsWith("[")) {
          try {
            const parsed = JSON.parse(single);
            if (Array.isArray(parsed)) {
              recipients = parsed.filter((r) => typeof r === "string");
            }
          } catch {
            recipients = recipientList;
          }
        } else {
          recipients = recipientList;
        }
      } else if (typeof rawRecipients === "string") {
        try {
          const parsed = JSON.parse(rawRecipients);
          if (Array.isArray(parsed)) recipients = parsed.filter((r) => typeof r === "string");
        } catch {
          recipients = rawRecipients.split(",").map((r) => r.trim()).filter(Boolean);
        }
      }

      if (!recipients.length) {
        return NextResponse.json({ error: "Pick at least one mutual to share with" }, { status: 400 });
      }
      if (kind !== "material") {
        return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
      }
      if (!title || title.length < 2) {
        return NextResponse.json({ error: "Missing title" }, { status: 400 });
      }

      const file = form.get("file");
      const bucketPayload = form.get("bucket") as string | null;
      const pathPayload = form.get("path") as string | null;
      
      let finalUrl = "";
      const bucket = "shared-materials";
      
      if (bucketPayload && pathPayload && bucketPayload === bucket) {
        // Direct storage upload flow (bypasses 4.5MB Vercel limit)
        if (!pathPayload.includes(`/${userId}/`)) {
          return NextResponse.json({ error: "Invalid storage path" }, { status: 403 });
        }
        const { data: publicData } = db.storage.from(bucket).getPublicUrl(pathPayload);
        finalUrl = publicData.publicUrl;
      } else if (file && file instanceof File) {
        // Legacy flow
        const isPdf =
          file.type === "application/pdf" ||
          file.name.toLowerCase().endsWith(".pdf");
        if (!isPdf) {
          return NextResponse.json({ error: "Only PDF files are supported" }, { status: 400 });
        }

        const safeName = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
        // Legacy path included shared-materials folder
        const path = `shared-materials/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
        const bytes = Buffer.from(await file.arrayBuffer());
        
        const { error: uploadError } = await db.storage
          .from(bucket)
          .upload(path, bytes, {
            contentType: file.type || "application/pdf",
            upsert: false,
          });
        if (uploadError) {
          return NextResponse.json({ error: uploadError.message }, { status: 500 });
        }
        const { data: publicData } = db.storage.from(bucket).getPublicUrl(path);
        finalUrl = publicData.publicUrl;
      } else {
        return NextResponse.json({ error: "Missing PDF file" }, { status: 400 });
      }

      const url = finalUrl;
      if (!url) return NextResponse.json({ error: "Failed to create file link" }, { status: 500 });

      const mutuals = await getMutualIds(db, userId);
      const valid = recipients.filter((r) => mutuals.has(r) && r !== userId);
      if (!valid.length) {
        return NextResponse.json({ error: "You can only share with your mutuals" }, { status: 403 });
      }

      const rows = valid.map((rid) => ({
        owner_id: userId,
        recipient_id: rid,
        kind: "material",
        ref_id: null,
        title: title.slice(0, 200),
        url: url.slice(0, 800),
        note: note ? String(note).slice(0, 500) : null,
      }));
      const { data, error } = await db.from("resource_shares").insert(rows).select();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ shared: data?.length ?? 0 }, { status: 201 });
    }

    const body = await req.json();
    const { recipient_id, recipient_ids, kind, ref_id, title, url, note } = body;

    // Accept one recipient or many.
    const recipients: string[] = [
      ...(Array.isArray(recipient_ids) ? recipient_ids : []),
      ...(typeof recipient_id === "string" ? [recipient_id] : []),
    ].filter((r, i, a) => typeof r === "string" && r !== userId && a.indexOf(r) === i);

    if (!recipients.length) {
      return NextResponse.json({ error: "Pick at least one mutual to share with" }, { status: 400 });
    }
    if (!["quiz", "flashcard", "material"].includes(kind)) {
      return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
    }
    if (!title || String(title).trim().length < 2) {
      return NextResponse.json({ error: "Missing title" }, { status: 400 });
    }
    if (kind === "material" && !/^https?:\/\/.+/i.test(String(url ?? ""))) {
      return NextResponse.json({ error: "Add a link to the material, such as a PDF URL" }, { status: 400 });
    }

    // Sharing is mutuals-only.
    const mutuals = await getMutualIds(db, userId);
    const valid = recipients.filter((r) => mutuals.has(r));
    if (!valid.length) {
      return NextResponse.json({ error: "You can only share with your mutuals" }, { status: 403 });
    }

    const rows = valid.map((rid) => ({
      owner_id: userId,
      recipient_id: rid,
      kind,
      ref_id: kind === "material" ? null : ref_id ?? null,
      title: String(title).slice(0, 200),
      url: kind === "material" ? String(url).slice(0, 800) : null,
      note: note ? String(note).slice(0, 500) : null,
    }));
    const { data, error } = await db.from("resource_shares").insert(rows).select();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ shared: data?.length ?? 0 }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// DELETE { scope: 'sent' | 'received' | 'all' } clears share history.
export async function DELETE(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const scope = typeof body?.scope === "string" ? body.scope : "all";

    if (scope === "sent") {
      const { error } = await db.from("resource_shares").delete().eq("owner_id", userId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }
    if (scope === "received") {
      const { error } = await db.from("resource_shares").delete().eq("recipient_id", userId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    const { error } = await db
      .from("resource_shares")
      .delete()
      .or(`owner_id.eq.${userId},recipient_id.eq.${userId}`);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
