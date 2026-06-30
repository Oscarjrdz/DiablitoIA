import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { publishChatEvent } from '@/lib/realtime';

export async function POST(req) {
  try {
    const { phone, read } = await req.json();
    if (!phone) return NextResponse.json({ success: false, error: 'phone requerido' });

    // Normalizar igual que el webhook: 52 + últimos 10 dígitos
    const digits = phone.replace(/\D/g, '');
    const cleanPhone = '52' + digits.slice(-10);

    if (read) {
      await redis.set(`human_read_${cleanPhone}`, '1');
      await redis.del(`chat_unread_${cleanPhone}`);
    } else {
      await redis.del(`human_read_${cleanPhone}`);
      await redis.set(`chat_unread_${cleanPhone}`, '1');
    }
    await publishChatEvent({ phone, redisPhone: cleanPhone, reason: 'read-state' });

    return NextResponse.json({ success: true, needsHuman: !read });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message });
  }
}
