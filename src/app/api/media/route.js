import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function GET(req) {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return new NextResponse('Missing id', { status: 400 });

    const raw = await redis.get(`media_${id}`);
    if (!raw) return new NextResponse('Not found', { status: 404 });

    const { mimeType, b64 } = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const buf = Buffer.from(b64, 'base64');
    return new NextResponse(buf, {
        headers: {
            'Content-Type': mimeType || 'image/jpeg',
            'Cache-Control': 'public, max-age=604800',
        },
    });
}
