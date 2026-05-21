import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Disposable / temporary inbox providers. Sign-ups from these domains were
// being shown a success toast even though confirmation mail never reached
// the recipient (mailticking.com, etc.) — block them at the boundary so the
// UI no longer lies about delivery.
const DISPOSABLE_EMAIL_DOMAINS = new Set<string>([
  "mailticking.com",
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamail.info",
  "guerrillamail.net",
  "guerrillamail.org",
  "guerrillamailblock.com",
  "sharklasers.com",
  "grr.la",
  "10minutemail.com",
  "10minutemail.net",
  "tempmail.com",
  "temp-mail.org",
  "temp-mail.io",
  "tempmailo.com",
  "tmpmail.org",
  "tmpmail.net",
  "yopmail.com",
  "yopmail.fr",
  "trashmail.com",
  "trashmail.net",
  "throwawaymail.com",
  "getnada.com",
  "nada.email",
  "dispostable.com",
  "fakeinbox.com",
  "maildrop.cc",
  "mintemail.com",
  "moakt.com",
  "mohmal.com",
  "emailondeck.com",
  "anonbox.net",
  "mytemp.email",
]);

/**
 * Server-side sign-up. Creates the user via the public `auth.signUp`
 * endpoint so Supabase's mail provider actually delivers the confirmation
 * link — the previous flow used `admin.createUser` + `admin.generateLink`,
 * which generates a link but does NOT send mail, so the UI was reporting
 * success even though no email was ever delivered.
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

    const domain = email.split("@")[1] ?? "";
    if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
      return NextResponse.json(
        {
          error:
            "Disposable email addresses aren't supported. Please use a permanent email.",
        },
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

    // Use the anon client with a no-op cookie store. signUp() through the
    // public endpoint triggers Supabase's standard verification email
    // (controlled by the project's "Confirm email" setting and SMTP
    // configuration). The admin / generateLink path did NOT send mail.
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return [];
          },
          setAll() {
            /* no-op: this request must NOT establish a session */
          },
        },
      },
    );

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=%2Fdashboard`,
        data: fullName ? { full_name: fullName } : undefined,
      },
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

    // Supabase returns a user with `identities: []` when the email is
    // already taken on a project that has "Confirm email" enabled — no
    // mail is sent in that case either. Surface it instead of pretending
    // the verification email is on its way.
    const identities = (data.user as { identities?: unknown[] } | null)
      ?.identities;
    if (Array.isArray(identities) && identities.length === 0) {
      return NextResponse.json(
        { error: "An account with this email already exists. Try signing in." },
        { status: 409 },
      );
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
