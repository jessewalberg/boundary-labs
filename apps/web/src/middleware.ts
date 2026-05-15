import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

const protectedPrefixes = [
  "/agents",
  "/campaigns",
  "/coverage",
  "/dashboard",
  "/evals",
  "/findings",
  "/judges",
  "/regressions",
  "/reports",
  "/schedule",
  "/secrets",
  "/seeds",
  "/targets",
  "/threat-model"
];

export function middleware(request: NextRequest) {
  const isProtected = protectedPrefixes.some((prefix) => request.nextUrl.pathname.startsWith(prefix));
  if (!isProtected) return NextResponse.next();

  const sessionCookie = getSessionCookie(request);
  if (sessionCookie) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|brand|healthz|readyz).*)"
  ]
};
