import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

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
  await supabase.auth.getSession();

  return response;
}

export const config = {
  matcher: [
    // Skip Next internals and static files. /api/* IS included so API routes
    // get a fresh session cookie before they call getUserId().
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
