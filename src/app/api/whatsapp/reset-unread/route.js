import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function POST() {
  try {
    const keys = await redis.keys('chat_unread_*');
    if (keys.length > 0) await Promise.all(keys.map(k => redis.del(k)));
    return NextResponse.json({ success: true, cleared: keys.length });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
