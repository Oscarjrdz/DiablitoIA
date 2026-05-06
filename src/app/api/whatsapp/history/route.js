import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  let phone = searchParams.get('phone');
  if (!phone) return NextResponse.json({ success: false });

  phone = phone.replace(/\D/g, '');
  if (!phone.startsWith('52')) phone = '52' + phone;

  try {
    const [histData] = await Promise.all([
      redis.get(`chat_hist_${phone}@c.us`) || redis.get(`chat_hist_${phone}`),
      redis.del(`chat_unread_${phone}`)
    ]);

    const parsed = typeof histData === 'string' ? JSON.parse(histData) : (histData || []);

    const messages = parsed.map(m => {
      const ts = m.parts?.[0]?.ts || null;
      return {
        text: m.parts?.[0]?.text || '',
        fromMe: m.role === 'model',
        ts,
        time: ts
          ? new Date(ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Monterrey' })
          : ''
      };
    });

    return NextResponse.json({ success: true, messages });
  } catch (e) {
    return NextResponse.json({ success: false });
  }
}
