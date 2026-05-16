import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function GET() {
  try {
    const logs = await redis.lrange('debug_ack_log', 0, 29);
    const parsed = logs.map(l => { try { return typeof l === 'string' ? JSON.parse(l) : l; } catch { return l; } });
    return NextResponse.json({ success: true, logs: parsed });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message });
  }
}
