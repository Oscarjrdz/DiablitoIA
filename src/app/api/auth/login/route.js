import { NextResponse } from "next/server";
import { findAuthUser, ROLE_HOME, sanitizeUser } from "@/lib/authConfig";
import { AUTH_COOKIE, createSessionToken, getSessionCookieOptions } from "@/lib/auth";

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const user = findAuthUser(body.phone, body.password);

  if (!user) {
    return NextResponse.json(
      { ok: false, message: "Telefono o PIN incorrecto." },
      { status: 401 },
    );
  }

  const safeUser = sanitizeUser(user);
  const response = NextResponse.json({
    ok: true,
    user: safeUser,
    redirectTo: ROLE_HOME[safeUser.role] || "/chat",
  });

  response.cookies.set(AUTH_COOKIE, createSessionToken(user), getSessionCookieOptions());
  return response;
}
