import { NextResponse } from "next/server";
import { AUTH_COOKIE, isRouteAllowedForRole, ROLE_HOME } from "@/lib/authConfig";

const PUBLIC_PATHS = new Set(["/login"]);

function getAuthSecret() {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "diablito-local-auth-v1";
}

function base64UrlToBytes(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function bytesToBase64Url(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function signBody(body) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(getAuthSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));

  return bytesToBase64Url(new Uint8Array(signature));
}

async function verifySessionToken(token) {
  if (!token || !token.includes(".")) return null;

  const [body, signature] = token.split(".");
  const expectedSignature = await signBody(body);
  if (signature !== expectedSignature) return null;

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(body)));
    if (!payload?.phone || !payload?.role || !payload?.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function redirectToLogin(request) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export async function middleware(request) {
  const pathname = request.nextUrl.pathname;
  const user = await verifySessionToken(request.cookies.get(AUTH_COOKIE)?.value);

  if (PUBLIC_PATHS.has(pathname)) {
    if (!user) return NextResponse.next();

    const url = request.nextUrl.clone();
    url.pathname = ROLE_HOME[user.role] || "/chat";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (!user) return redirectToLogin(request);

  if (!isRouteAllowedForRole(pathname, user.role)) {
    const url = request.nextUrl.clone();
    url.pathname = ROLE_HOME[user.role] || "/chat";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
