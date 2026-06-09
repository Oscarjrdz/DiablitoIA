import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

// Convierte base64 o URL externa a URL pública en Redis (para que el gateway pueda accederla)
async function toPublicUrl(src, host) {
  if (!src) return src;
  // Ya es data URL (base64)
  if (src.startsWith('data:')) {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await redis.set(`temp_img_${id}`, src, { ex: 3600 });
    return `https://${host}/api/whatsapp/temp-image?id=${id}`;
  }
  // URL externa (e.g. WhatsApp media URL que puede caducar) — la descargamos y re-hosteamos
  if (src.startsWith('http')) {
    try {
      const r = await fetch(src);
      if (!r.ok) return src;
      const buf = await r.arrayBuffer();
      const ct = r.headers.get('content-type') || 'image/jpeg';
      const b64 = Buffer.from(buf).toString('base64');
      const dataUrl = `data:${ct};base64,${b64}`;
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await redis.set(`temp_img_${id}`, dataUrl, { ex: 3600 });
      return `https://${host}/api/whatsapp/temp-image?id=${id}`;
    } catch {
      return src; // fallback a la URL original
    }
  }
  return src;
}

export async function POST(req) {
  try {
    const { to, text, attachment, attachmentType } = await req.json();
    if (!to) return NextResponse.json({ success: false });

    const host = req.headers.get('host');

    let isGroup = to.includes('@g.us');
    let wappTo = to;
    let redisPhone = to;

    if (isGroup) {
      wappTo = to;
      redisPhone = '52' + to.replace(/\D/g, '').slice(-10);
    } else {
      let cleanTo = to.replace(/\D/g, '');
      if (!cleanTo.startsWith('52')) cleanTo = '52' + cleanTo;
      wappTo = `${cleanTo}@c.us`;
      redisPhone = cleanTo;
    }

    const configStr = await redis.get('wapp_config');
    const wConfig = typeof configStr === 'string' ? JSON.parse(configStr) : (configStr || {});
    if (!wConfig.wappInstance || !wConfig.wappToken) return NextResponse.json({ success: false, error: 'No config' });

    const ts = Date.now();
    const histEntry = { text: text || '', ts, status: 'sent' };
    if (attachment) { histEntry.attachmentType = attachmentType; histEntry.hasAttachment = true; }

    const hKey = `chat_hist_${redisPhone}@c.us`;
    let history = await redis.get(hKey) || await redis.get(`chat_hist_${redisPhone}`);
    let parsed = typeof history === 'string' ? JSON.parse(history) : (history || []);
    parsed.push({ role: 'model', parts: [histEntry] });

    const baseUrl = `https://gatewaywapp-production.up.railway.app/${wConfig.wappInstance}`;
    let endpoint = '/messages/chat';
    let body = { token: wConfig.wappToken, to: wappTo, body: text };

    if (attachment && attachmentType === 'image') {
      const imageUrl = await toPublicUrl(attachment, host);
      histEntry.attachmentUrl = imageUrl; // guardar URL para que el poll la muestre
      endpoint = '/messages/image';
      body = { token: wConfig.wappToken, to: wappTo, image: imageUrl, caption: text };
    } else if (attachment && attachmentType === 'audio') {
      endpoint = '/messages/audio';
      body = { token: wConfig.wappToken, to: wappTo, audio: attachment };
    } else if (attachment && attachmentType === 'document') {
      endpoint = '/messages/document';
      body = { token: wConfig.wappToken, to: wappTo, document: attachment, mimetype: 'application/pdf', fileName: 'Documento.pdf', caption: text };
    }

    const raw = await fetch(baseUrl + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (raw.ok) {
      try {
        const sendData = await raw.json();
        await redis.set('debug_last_send_response', JSON.stringify(sendData));
        const rawId = sendData?.messageId
          || sendData?.key?.id
          || sendData?.data?.key?.id
          || sendData?.response?.key?.id
          || sendData?.response?.id
          || sendData?.id
          || sendData?.msgId;
        const msgId = typeof rawId === 'object' ? (rawId?._serialized || null) : rawId;
        if (msgId) {
          await redis.setex(`chat_msg_${msgId}`, 604800, redisPhone);
          parsed[parsed.length - 1].parts[0].msgId = msgId;
        }
      } catch {}
    } else {
      console.error('Wapp Gateway Error', await raw.text().catch(() => ''));
    }

    await redis.set(hKey, JSON.stringify(parsed));
    await redis.set(`chat_hist_${redisPhone}`, JSON.stringify(parsed));
    await redis.sadd('chat_phones', redisPhone);
    await redis.set(`human_read_${redisPhone}`, '1');
    await redis.del(`delivery_mode_${redisPhone}`);
    const sentMsgId = parsed[parsed.length - 1]?.parts?.[0]?.msgId || null;
    return NextResponse.json({ success: true, msgId: sentMsgId, ts });
  } catch (e) {
    console.error('Send message error:', e);
    return NextResponse.json({ success: false });
  }
}
