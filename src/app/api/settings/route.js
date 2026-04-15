import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function GET() {
  try {
    const config = await redis.get('wapp_config') || {};
    return NextResponse.json({ success: true, config });
  } catch (err) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const body = await req.json();
    await redis.set('wapp_config', body);
    if (body.loyverseToken) { await redis.set('loyverse_token', body.loyverseToken); }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
