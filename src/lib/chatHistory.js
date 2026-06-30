import { redis } from './redis';
import { saveChatMeta } from './chatMeta';

/**
 * Saves a bot/system message to the Redis chat history under both standard keys.
 * Handles text, image attachments (like coupon images), and msgId tracking.
 *
 * @param {string} phone - Target WhatsApp phone number
 * @param {string} text - Message text content
 * @param {string|null} name - Customer name (to update cache)
 * @param {string|null} imageUrl - Promotion image URL
 * @param {string|null} msgId - Optional message ID returned by the gateway
 */
export async function saveBotMessage(phone, text, name = null, imageUrl = null, msgId = null) {
  if (!phone || !text) return;
  let cleanPhone = phone.replace(/\D/g, '');
  if (!cleanPhone.startsWith('52')) cleanPhone = '52' + cleanPhone;
  const histKey = `chat_hist_${cleanPhone}@c.us`;
  try {
    const raw = await redis.get(histKey);
    let parsed = [];
    if (raw) {
      parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!Array.isArray(parsed)) parsed = [];
    }

    const part = { text, ts: Date.now() };
    if (imageUrl) {
      part.hasAttachment = true;
      part.attachmentType = 'image';
      part.attachmentUrl = imageUrl;
    }
    if (msgId) {
      part.msgId = msgId;
      part.status = 'sent';
    }

    parsed.push({ role: 'model', parts: [part] });
    if (parsed.length > 40) parsed.splice(0, parsed.length - 40);

    // Persist under both keys for maximum safety and quick lookup by frontend
    await redis.set(histKey, JSON.stringify(parsed));
    await redis.set(`chat_hist_${cleanPhone}`, JSON.stringify(parsed));
    await saveChatMeta(cleanPhone, parsed);

    // Keep name cached for consistency in chat list
    if (name) {
      await redis.set(`client_name_${cleanPhone}`, name);
    }
  } catch (e) {
    console.error('[saveBotMessage] Error:', e);
  }
}
