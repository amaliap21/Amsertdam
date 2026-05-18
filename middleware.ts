import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Only refresh the auth session on requests that actually need it. API
  // routes use the service-role admin client (not user auth), and adding a
  // 100-500ms Supabase auth round-trip to every fetch is why the dashboard
  // was taking 6 seconds to render its course list.
  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith("/api/")) return response;
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
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response = NextResponse.next({ request });
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // getSession() reads cookies locally and refreshes the access token only
  // when needed — no unconditional round-trip to the auth server.
  await supabase.auth.getSession();

  return response;
}

export const config = {
  matcher: [
    // Skip Next internals, static files, and all /api/* routes (those use the
    // admin client and don't need a per-request auth check).
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};