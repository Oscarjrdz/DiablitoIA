import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  let phone = searchParams.get('phone') || '';
  if (!phone) return NextResponse.json({ success: false });

  let isGroup = phone.includes('@g.us');
  let redisPhone = phone;

  if (isGroup) {
    // History is saved by webhook under mangled cleanPhone
    redisPhone = '52' + phone.replace(/\D/g, '').slice(-10);
  } else {
    redisPhone = phone.replace(/\D/g, '');
    if (!redisPhone.startsWith('52')) redisPhone = '52' + redisPhone;
  }

  // Only clear unread when explicitly requested (on chat open, not polls)
  const clearUnread = searchParams.get('clearUnread');
  if (clearUnread) {
    await redis.del(`chat_unread_${redisPhone}`);
  }

  try {
    const [histData, typingRaw, botSilenceRaw] = await Promise.all([
      (async () => {
        const a = await redis.get(`chat_hist_${redisPhone}@c.us`);
        if (a) return a;
        return redis.get(`chat_hist_${redisPhone}`);
      })(),
      redis.get(`typing_${redisPhone}`),
      redis.get(`delivery_bot_silence_${redisPhone}`)
    ]);

    const parsed = typeof histData === 'string' ? JSON.parse(histData) : (histData || []);

    const messages = parsed.map(m => {
      const part = m.parts?.[0] || {};
      const ts = part.ts || null;
      const rawText = part.text || '';
      // Limpiar formato antiguo "Nombre (telefono): mensaje" en grupos
      const text = isGroup ? rawText.replace(/^.+?\s*\(\d{7,}\):\s*/, 'Miembro: ') : rawText;
      return {
        text,
        fromMe: m.role === 'model',
        ts,
        time: ts
          ? new Date(ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Monterrey' })
          : '',
        msgId: part.msgId || null,
        status: part.status || (m.role === 'model' ? 'sent' : null),
        attachmentType: part.attachmentType || null,
        hasAttachment: part.hasAttachment || false,
        attachmentUrl: part.attachmentUrl || null
      };
    });

    // ── Server-side dedup safety net ──
    // Remove duplicate fromMe messages with identical text within 5s window.
    // Keep the one with a msgId (or the first one if neither has one).
    const STATUS_ORDER = { sent: 1, delivered: 2, read: 3 };
    const deduped = [];
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (m.fromMe && deduped.length > 0) {
        const prev = deduped[deduped.length - 1];
        if (prev.fromMe && prev.text === m.text && m.ts && prev.ts && Math.abs(m.ts - prev.ts) < 5000) {
          // Duplicate: merge keeping best msgId and highest status
          const bestMsgId = m.msgId || prev.msgId;
          const bestStatus = (STATUS_ORDER[m.status] || 0) > (STATUS_ORDER[prev.status] || 0) ? m.status : prev.status;
          if (bestMsgId !== prev.msgId || bestStatus !== prev.status) {
            deduped[deduped.length - 1] = { ...prev, msgId: bestMsgId, status: bestStatus };
          }
          continue;
        }
      }
      deduped.push(m);
    }

    const lastTs = deduped.length > 0 ? deduped[deduped.length - 1].ts : 0;
    const statusSig = deduped
      .filter(m => m.fromMe)
      .map(m => `${m.msgId || m.ts || ''}:${m.status || ''}`)
      .join('|');
    return NextResponse.json({ success: true, messages: deduped, msgCount: deduped.length, lastTs, statusSig, isTyping: !!typingRaw, botSilent: !!botSilenceRaw });
  } catch (e) {
    return NextResponse.json({ success: false, messages: [], isTyping: false });
  }
}
