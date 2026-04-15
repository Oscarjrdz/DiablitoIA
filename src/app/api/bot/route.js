import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function GET() {
  try {
    const prompt = await redis.get('bot_prompt') || '';
    return NextResponse.json({ success: true, prompt });
  } catch (err) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const { prompt } = await req.json();
    await redis.set('bot_prompt', prompt);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
