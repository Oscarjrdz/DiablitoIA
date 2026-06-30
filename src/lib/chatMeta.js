import { redis } from './redis';

export function normalizeChatPhone(value) {
  if (!value) return '';
  const raw = String(value);
  if (raw.includes('@g.us')) return '52' + raw.replace(/\D/g, '').slice(-10);
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('52') ? digits : '52' + digits.slice(-10);
}

export function historyToChatMeta(redisPhone, history = {}) {
  const parsed = Array.isArray(history) ? history : [];
  const lastMsg = parsed.length > 0 ? parsed[parsed.length - 1] : null;
  const part = lastMsg?.parts?.[0] || {};
  const fromMe = lastMsg?.role === 'model';

  return {
    redisPhone,
    lastText: String(part.text || '').substring(0, 80),
    lastTs: part.ts || 0,
    lastStatus: part.status || (fromMe ? 'sent' : null),
    fromMe,
    msgCount: parsed.length,
    updatedAt: Date.now(),
  };
}

export async function saveChatMeta(redisPhone, history, extra = {}) {
  const cleanPhone = normalizeChatPhone(redisPhone);
  if (!cleanPhone) return null;
  const meta = { ...historyToChatMeta(cleanPhone, history), ...extra };
  await redis.set(`chat_meta_${cleanPhone}`, JSON.stringify(meta));
  await redis.sadd?.('chat_phones', cleanPhone);
  return meta;
}

export async function patchChatMeta(redisPhone, patch = {}) {
  const cleanPhone = normalizeChatPhone(redisPhone);
  if (!cleanPhone) return null;
  const key = `chat_meta_${cleanPhone}`;
  const raw = await redis.get(key);
  const current = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : { redisPhone: cleanPhone };
  const next = { ...current, ...patch, redisPhone: cleanPhone, updatedAt: Date.now() };
  await redis.set(key, JSON.stringify(next));
  await redis.sadd?.('chat_phones', cleanPhone);
  return next;
}
