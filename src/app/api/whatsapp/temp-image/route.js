import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

// POST — recibe base64, lo guarda en Redis 1h, devuelve URL pública
export async function POST(req) {
  try {
    const { base64, host } = await req.json();
    if (!base64?.startsWith('data:')) return NextResponse.json({ success: false }, { status: 400 });
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await redis.set(`temp_img_${id}`, base64, { ex: 3600 });
    const url = `https://${host}/api/whatsapp/temp-image?id=${id}`;
    return NextResponse.json({ success: true, url });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

// GET — sirve la imagen almacenada
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return new Response('Not found', { status: 404 });
    const base64 = await redis.get(`temp_img_${id}`);
    if (!base64) return new Response('Not found', { status: 404 });
    const match = String(base64).match(/^data:([^;]+);base64,(.+)$/s);
    if (!match) return new Response('Invalid', { status: 400 });
    const buf = Buffer.from(match[2], 'base64');
    return new Response(buf, {
      headers: { 'Content-Type': match[1], 'Cache-Control': 'public, max-age=3600' }
    });
  } catch (e) {
    return new Response('Error', { status: 500 });
  }
}
