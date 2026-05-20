import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Server-side sign-up that auto-confirms the email so users can sign in
 * immediately. The client's supabase.auth.signUp() requires email confirmation
 * by default, which surfaces as "Invalid login credentials" when the user
 * tries to sign in before clicking the confirmation link.
 *
 * Uses the service-role admin client to create the user with email_confirm:true.
 * The client should then call supabase.auth.signInWithPassword() to establish
 * a session.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const fullName =
      typeof body.fullName === "string" ? body.fullName.trim() : undefined;

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 },
      );
    }
    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters." },
        { status: 400 },
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = supabaseAdmin as any;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: fullName ? { full_name: fullName } : undefined,
    });

    if (error) {
      // Normalise "already registered" so the client can show a friendly message.
      const msg = String(error.message ?? "");
      if (/already\s+registered|exists/i.test(msg)) {
        return NextResponse.json(
          { error: "An account with this email already exists. Try signing in." },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: msg || "Sign-up failed." }, { status: 400 });
    }

    return NextResponse.json({ id: data.user?.id, email: data.user?.email });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sign-up failed." },
      { status: 500 },
    );
  }
}
