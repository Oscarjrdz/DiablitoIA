import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function GET() {
  const mode = await redis.get('system_mode') || 'online';
  return NextResponse.json({ mode });
}

export async function POST(req) {
  const { mode } = await req.json();
  if (mode !== 'online' && mode !== 'offline') {
    return NextResponse.json({ success: false, error: 'mode must be online or offline' }, { status: 400 });
  }
  await redis.set('system_mode', mode);
  return NextResponse.json({ success: true, mode });
}
