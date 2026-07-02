export const AUTH_COOKIE = "diablito_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

export const USERS = [
  {
    phone: "8116038195",
    password: "1983",
    role: "super_admin",
    name: "Oscar",
  },
  {
    phone: "8120313481",
    password: "1984",
    role: "order_taker",
    name: "Tomador de pedidos",
  },
];

export const ROLE_HOME = {
  super_admin: "/",
  order_taker: "/chat",
};

export function normalizeAuthPhone(value) {
  return String(value || "").replace(/\D/g, "").slice(-10);
}

export function sanitizeUser(user) {
  if (!user) return null;

  return {
    phone: user.phone,
    role: user.role,
    name: user.name,
  };
}

export function findAuthUser(phone, password) {
  const normalizedPhone = normalizeAuthPhone(phone);
  const pin = String(password || "").trim();

  return USERS.find((user) => user.phone === normalizedPhone && user.password === pin) || null;
}

export function isRouteAllowedForRole(pathname, role) {
  if (role === "super_admin") return true;
  if (role === "order_taker") return pathname === "/chat" || pathname.startsWith("/chat/");
  return false;
}
