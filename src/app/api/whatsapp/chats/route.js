import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function GET() {
  try {
    const keys = await redis.keys('chat_hist_*@c.us');
    if (!keys || keys.length === 0) return NextResponse.json({ success: true, chats: [] });

    const chats = await Promise.all(keys.map(async (key) => {
      const phone = key.replace('chat_hist_', '').replace('@c.us', '');
      try {
        const [histData, cachedName, unreadRaw] = await Promise.all([
          redis.get(key),
          redis.get(`client_name_${phone}`),
          redis.get(`chat_unread_${phone}`)
        ]);
        const parsed = typeof histData === 'string' ? JSON.parse(histData) : (histData || []);
        const lastMsg = parsed.length > 0 ? parsed[parsed.length - 1] : null;
        return {
          phone,
          name: cachedName || phone.slice(-10),
          lastText: (lastMsg?.parts?.[0]?.text || '').substring(0, 80),
          lastTs: lastMsg?.parts?.[0]?.ts || 0,
          fromMe: lastMsg?.role === 'model',
          unread: parseInt(unreadRaw || '0'),
          msgCount: parsed.length
        };
      } catch {
        return { phone, name: phone.slice(-10), lastText: '', lastTs: 0, fromMe: false, unread: 0, msgCount: 0 };
      }
    }));

    chats.sort((a, b) => (b.lastTs || 0) - (a.lastTs || 0));
    return NextResponse.json({ success: true, chats });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message, chats: [] });
  }
}

// Elimina el historial de un chat por teléfono
export async function DELETE(req) {
  try {
    const { searchParams } = new URL(req.url);
    let phone = (searchParams.get('phone') || '').replace(/\D/g, '');
    if (!phone.startsWith('52')) phone = '52' + phone;
    if (!phone) return NextResponse.json({ success: false, error: 'phone requerido' });

    await Promise.all([
      redis.del(`chat_hist_${phone}@c.us`),
      redis.del(`chat_hist_${phone}`),
      redis.del(`chat_unread_${phone}`),
      redis.del(`typing_${phone}`)
    ]);

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
