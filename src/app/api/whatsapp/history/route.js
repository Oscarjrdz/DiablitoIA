import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  let phone = searchParams.get('phone') || '';
  phone = phone.replace(/\D/g, '');
  if (!phone.startsWith('52')) phone = '52' + phone;
  if (!phone) return NextResponse.json({ success: false });

  try {
    const [histData, unreadDel, typingRaw] = await Promise.all([
      (async () => {
        const a = await redis.get(`chat_hist_${phone}@c.us`);
        if (a) return a;
        return redis.get(`chat_hist_${phone}`);
      })(),
      redis.del(`chat_unread_${phone}`),
      redis.get(`typing_${phone}`)
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

    return NextResponse.json({ success: true, messages, isTyping: !!typingRaw });
  } catch (e) {
    return NextResponse.json({ success: false, messages: [], isTyping: false });
  }
}
