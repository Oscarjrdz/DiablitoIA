import crypto from "crypto";
import { AUTH_COOKIE, SESSION_MAX_AGE, sanitizeUser } from "@/lib/authConfig";

function getAuthSecret() {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "diablito-local-auth-v1";
}

function toBase64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function signBody(body) {
  return crypto.createHmac("sha256", getAuthSecret()).update(body).digest("base64url");
}

export function createSessionToken(user) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    ...sanitizeUser(user),
    iat: now,
    exp: now + SESSION_MAX_AGE,
  };
  const body = toBase64Url(JSON.stringify(payload));
  const signature = signBody(body);

  return `${body}.${signature}`;
}

export function verifySessionToken(token) {
  if (!token || !token.includes(".")) return null;

  const [body, signature] = token.split(".");
  const expectedSignature = signBody(body);
  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);

  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload?.phone || !payload?.role || !payload?.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return sanitizeUser(payload);
  } catch {
    return null;
  }
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  };
}

export { AUTH_COOKIE };
