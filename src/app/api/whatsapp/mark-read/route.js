import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

// POST — Toggle human-read status of a chat
export async function POST(req) {
  try {
    const { phone, read } = await req.json();
    if (!phone) return NextResponse.json({ success: false, error: 'phone requerido' });

    let cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone.startsWith('52')) cleanPhone = '52' + cleanPhone;

    if (read) {
      await redis.set(`human_read_${cleanPhone}`, '1');
    } else {
      await redis.del(`human_read_${cleanPhone}`);
    }

    return NextResponse.json({ success: true, needsHuman: !read });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message });
  }
}
