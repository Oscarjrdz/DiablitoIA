import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { publishChatEvent } from '@/lib/realtime';

// POST — Create a new empty chat in Redis
export async function POST(req) {
  try {
    const { phone, name } = await req.json();
    if (!phone) return NextResponse.json({ success: false, error: 'phone requerido' });

    let cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone.startsWith('52')) cleanPhone = '52' + cleanPhone;

    const histKey = `chat_hist_${cleanPhone}@c.us`;
    const existing = await redis.get(histKey);

    if (!existing) {
      // Create empty history
      await redis.set(histKey, JSON.stringify([]));
      await redis.set(`chat_hist_${cleanPhone}`, JSON.stringify([]));
    }

    // Save contact name if provided
    if (name?.trim()) {
      await redis.set(`client_name_${cleanPhone}`, name.trim());
    }

    // Mark as read (human-created)
    await redis.set(`human_read_${cleanPhone}`, '1');
    await redis.sadd('chat_phones', cleanPhone);
    await publishChatEvent({ phone: cleanPhone, reason: 'create-chat' });

    return NextResponse.json({ success: true, phone: cleanPhone });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message });
  }
}
