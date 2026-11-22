import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Refreshes the Supabase session cookie and makes an optimistic redirect to
 * /login for signed-out visitors. Authorisation itself happens server-side
 * (requireViewer) and in the database (RLS) — this is not the boundary.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const forcedMock = process.env.DATA_SOURCE === "mock";
  if (!url || !key || forcedMock) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic = path.startsWith("/login") || path.startsWith("/auth");
  if (!data.user && !isPublic) {
    const to = request.nextUrl.clone();
    to.pathname = "/login";
    to.search = "";
    return NextResponse.redirect(to);
  }
  return response;
}

export const config = {
  // Skip static assets and machine endpoints (webhooks/cron authenticate themselves).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/webhooks|api/cron|api/health|.*\\.(?:svg|png|jpg|ico|webp)$).*)"],
};
