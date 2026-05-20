import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Server-side sign-up that creates the user WITHOUT auto-confirming.
 * Supabase Auth then sends a confirmation email; the user follows the
 * link to `/auth/callback`, which establishes the session.
 *
 * The client also passes `agreedToTerms: true`; we reject sign-ups that
 * haven't accepted the Terms, so a bypass of the UI checkbox can't
 * register an account.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const fullName =
      typeof body.fullName === "string" ? body.fullName.trim() : undefined;
    const agreedToTerms = body.agreedToTerms === true;

    // Reject obviously bogus email shapes early. Supabase will do its own
    // validation, but a quick regex stops sign-ups like "asdf" before they
    // burn a confirmation email.
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!email || !EMAIL_RE.test(email)) {
      return NextResponse.json(
        { error: "Please enter a valid email address." },
        { status: 400 },
      );
    }
    if (!password) {
      return NextResponse.json(
        { error: "Password is required." },
        { status: 400 },
      );
    }
    if (password.length < 8) {
      return NextResponse.json(
        { error: "Password must be at least 8 characters." },
        { status: 400 },
      );
    }
    if (!agreedToTerms) {
      return NextResponse.json(
        { error: "You must accept the Terms and Privacy Policy to sign up." },
        { status: 400 },
      );
    }

    // The browser passes its own origin so the redirect link in the
    // verification email points back at the right host (works for both
    // localhost and the Vercel deployment without a hard-coded URL).
    const reqUrl = new URL(req.url);
    const origin =
      typeof body.origin === "string" && body.origin.startsWith("http")
        ? body.origin
        : reqUrl.origin;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = supabaseAdmin as any;

    // Use generateLink so we control the redirectTo and Supabase emails
    // the confirmation link automatically.
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      // Email NOT auto-confirmed; Supabase sends the confirmation email
      // (provided "Confirm email" is enabled in the Auth dashboard, which
      // is the default).
      email_confirm: false,
      user_metadata: fullName ? { full_name: fullName } : undefined,
    });

    if (error) {
      const msg = String(error.message ?? "");
      if (/already\s+registered|exists/i.test(msg)) {
        return NextResponse.json(
          { error: "An account with this email already exists. Try signing in." },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: msg || "Sign-up failed." }, { status: 400 });
    }

    // Trigger the confirmation email via Supabase's signup-link generator,
    // so the link points to our /auth/callback?next=/dashboard.
    const { error: linkError } = await admin.auth.admin.generateLink({
      type: "signup",
      email,
      password,
      options: {
        redirectTo: `${origin}/auth/callback?next=%2Fdashboard`,
      },
    });
    if (linkError) {
      // Non-fatal: the account exists, the user can use "Forgot password"
      // or request a resend. Just log it for visibility.
      console.error("signup: generateLink failed", linkError);
    }

    return NextResponse.json({
      id: data.user?.id,
      email: data.user?.email,
      needsEmailConfirmation: true,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sign-up failed." },
      { status: 500 },
    );
  }
}
