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
      return {
        text: part.text || '',
        fromMe: m.role === 'model',
        ts,
        time: ts
          ? new Date(ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Monterrey' })
          : '',
        status: part.status || (m.role === 'model' ? 'sent' : null),
        attachmentType: part.attachmentType || null,
        hasAttachment: part.hasAttachment || false,
        attachmentUrl: part.attachmentUrl || null
      };
    });

    const lastTs = messages.length > 0 ? messages[messages.length - 1].ts : 0;
    return NextResponse.json({ success: true, messages, msgCount: messages.length, lastTs, isTyping: !!typingRaw, botSilent: !!botSilenceRaw });
  } catch (e) {
    return NextResponse.json({ success: false, messages: [], isTyping: false });
  }
}
