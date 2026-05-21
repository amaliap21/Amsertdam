import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import sgMail from "@sendgrid/mail";
import { supabaseAdmin } from "@/lib/supabase/admin";

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

    const redirectTo = `${origin}/auth/callback?next=%2Fdashboard`;
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectTo,
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
      // Supabase's built-in SMTP can fail or be rate-limited (free tier
      // caps signup emails very aggressively). When the failure is
      // specifically about delivery, fall back to creating the user via
      // the admin API and sending the confirmation link through SendGrid
      // directly. The account still ends up in Supabase — the user is
      // simply not relying on Supabase's SMTP relay for the email.
      if (/sending\s+(confirmation|signup)?\s*email|smtp|rate/i.test(msg)) {
        const fallback = await sendSignupViaSendGrid({
          email,
          password,
          fullName,
          redirectTo,
        });
        if (fallback.ok) {
          return NextResponse.json({
            id: fallback.userId,
            email,
            needsEmailConfirmation: true,
            via: "sendgrid-fallback",
          });
        }
        return NextResponse.json(
          { error: fallback.error },
          { status: fallback.status },
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

type SendGridFallbackResult =
  | { ok: true; userId: string | undefined; error?: never; status?: never }
  | { ok: false; userId?: never; error: string; status: number };

/**
 * Create the account via the admin API and send the verification link
 * through SendGrid directly. Used when Supabase Auth's own SMTP relay
 * can't deliver (rate limit, transient SMTP error). Requires
 * `SENDGRID_API_KEY` and `SENDGRID_FROM_EMAIL` (a sender verified in the
 * SendGrid dashboard); without them we surface a clear error so the UI
 * doesn't lie.
 */
async function sendSignupViaSendGrid(args: {
  email: string;
  password: string;
  fullName: string | undefined;
  redirectTo: string;
}): Promise<SendGridFallbackResult> {
  const { email, password, fullName, redirectTo } = args;
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromAddress = process.env.SENDGRID_FROM_EMAIL;
  if (!apiKey || !fromAddress) {
    return {
      ok: false,
      status: 503,
      error:
        "Email delivery is temporarily unavailable. Please try again in a few minutes, or contact support if the problem persists.",
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = supabaseAdmin as any;

  // Create the user without confirming. If it already exists with the same
  // password the createUser call will error — that's fine, we treat it as
  // a re-send by generating a fresh link below.
  let userId: string | undefined;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    user_metadata: fullName ? { full_name: fullName } : undefined,
  });
  if (created.error) {
    const msg = String(created.error.message ?? "");
    if (!/already\s+registered|exists/i.test(msg)) {
      return { ok: false, status: 400, error: msg || "Sign-up failed." };
    }
    // Fall through: existing unconfirmed user, look up id below.
  } else {
    userId = created.data?.user?.id;
  }

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "signup",
    email,
    password,
    options: { redirectTo },
  });
  if (linkError || !linkData?.properties?.action_link) {
    return {
      ok: false,
      status: 500,
      error: linkError?.message ?? "Could not generate verification link.",
    };
  }
  if (!userId) userId = linkData.user?.id;

  const actionLink: string = linkData.properties.action_link;

  try {
    sgMail.setApiKey(apiKey);
    await sgMail.send({
      from: { email: fromAddress, name: "RealTrack" },
      to: email,
      subject: "Verify your RealTrack account",
      html: buildVerificationEmailHtml({ actionLink, fullName }),
    });
  } catch (err) {
    // SendGrid surfaces details under `response.body.errors` on rejection
    // (invalid sender, rate limit, malformed payload). Bubble the most
    // useful one up so we don't show the user a generic "send failed".
    const detail = extractSendGridError(err);
    return {
      ok: false,
      status: 502,
      error: `Email provider rejected the message: ${detail}`,
    };
  }

  return { ok: true, userId };
}

function extractSendGridError(err: unknown): string {
  const e = err as {
    message?: string;
    response?: { body?: { errors?: { message?: string }[] } };
  };
  const first = e?.response?.body?.errors?.[0]?.message;
  if (first) return first;
  return e?.message ?? "unknown error";
}

function buildVerificationEmailHtml(args: {
  actionLink: string;
  fullName: string | undefined;
}): string {
  const greeting = args.fullName ? `Hi ${escapeHtml(args.fullName)},` : "Hi,";
  const link = escapeHtml(args.actionLink);
  return `<!doctype html>
<html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111;line-height:1.5">
  <p>${greeting}</p>
  <p>Thanks for signing up for RealTrack. Click the button below to verify your email and finish setting up your account.</p>
  <p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#4f46e5;color:#fff;border-radius:9999px;text-decoration:none;font-weight:500">Verify email</a></p>
  <p>Or paste this link into your browser:<br><a href="${link}">${link}</a></p>
  <p style="color:#666;font-size:12px">If you didn't sign up for RealTrack, you can ignore this email.</p>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
