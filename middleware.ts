import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Paths that don't require an authenticated session. Everything else under the
// app root is treated as protected and redirected to /sign-in for anonymous
// visitors. Keep in sync with the PUBLIC_PATHS list in src/app/layout.tsx.
const PUBLIC_PATHS = new Set<string>([
  "/",
  "/sign-in",
  "/sign-up",
  "/check-email",
  "/forgot-password",
  "/reset-password",
  "/terms",
  "/privacy",
]);

// Path prefixes that the gate must let through unauthenticated: the OAuth /
// magic-link landing route, and any API routes (those enforce auth themselves
// via requireUserId, and returning a 307 redirect for an XHR would break
// clients that expect JSON).
const PUBLIC_PREFIXES = ["/auth/", "/api/"];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Skip static assets only. API routes DO need the auth refresh, they use
  // the service-role admin client but still call getUserId() to scope queries
  // by user_id; without a refresh, an expired access token returns null and
  // queries fall back to the unscoped path, leaking other users' data.
  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith("/_next/")) return response;
  if (pathname === "/favicon.ico" || /\.[a-z0-9]+$/i.test(pathname)) return response;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        // Standard Supabase SSR template: build the response once after
        // mutating request cookies, then mirror each cookie onto it. The
        // previous loop recreated `response` for every cookie, dropping any
        // earlier cookies that had already been written.
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // getSession() reads cookies locally and refreshes the access token only
  // when needed, no unconditional round-trip to the auth server.
  //
  // When the cookie holds a refresh token the auth server no longer knows
  // about (user deleted, token revoked, project reset), Supabase throws
  // "Invalid Refresh Token: Refresh Token Not Found". Treat that as
  // signed-out: swallow the throw and clear the stale cookies so the
  // client doesn't keep re-attempting the refresh on every navigation.
  let userId: string | null = null;
  try {
    const { data } = await supabase.auth.getSession();
    userId = data.session?.user?.id ?? null;
  } catch (err) {
    const msg = String((err as Error)?.message ?? err);
    if (/refresh token|invalid|jwt/i.test(msg)) {
      // Local-scope signOut clears every sb-* cookie via the setAll
      // callback above without hitting the auth server (which would
      // also fail with the same invalid token). Breaks the refresh loop.
      await supabase.auth
        .signOut({ scope: "local" })
        .catch(() => undefined);
    } else {
      // Unknown error — log but don't block the request. The page will
      // render as signed-out; the user can sign in again.
      console.error("middleware: getSession failed", err);
    }
  }

  // Auth gate: anonymous visitors hitting a protected page get bounced to
  // /sign-in. Without this, internal pages (/dashboard, /priority-planner,
  // etc.) were reachable directly via the address bar and their chrome
  // would render before client-side data calls 401'd — a Broken Access
  // Control finding.
  if (!userId && !isPublicPath(pathname)) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(signInUrl);
  }

  return response;
}

export const config = {
  matcher: [
    // Skip Next internals and static files. /api/* IS included so API routes
    // get a fresh session cookie before they call getUserId().
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
