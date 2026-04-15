import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get('key');
  const val = await redis.get(key);
  return NextResponse.json({ key, val });
}

export async function POST(req) {
  const { key, value } = await req.json();
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 });
  await redis.set(key, value);
  return NextResponse.json({ success: true, key });
}
