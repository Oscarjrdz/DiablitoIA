import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { publishChatEvent } from '@/lib/realtime';

export async function POST(req) {
  try {
    const { phone, silent } = await req.json();
    if (!phone) return NextResponse.json({ success: false, error: 'phone requerido' });

    let cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone.startsWith('52')) cleanPhone = '52' + cleanPhone;

    if (silent) {
      // Silencio manual sin expiración (humano tomó control)
      await redis.set(`delivery_bot_silence_${cleanPhone}`, 'manual');
    } else {
      // Reactivar bot
      await redis.del(`delivery_bot_silence_${cleanPhone}`);
    }
    await publishChatEvent({ phone, redisPhone: cleanPhone, reason: 'bot-silence' });

    return NextResponse.json({ success: true, botSilent: !!silent });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
