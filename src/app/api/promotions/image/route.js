import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    const promosInfo = await redis.get('promotions');
    let promos = [];
    if (typeof promosInfo === 'string') {
      promos = JSON.parse(promosInfo);
    } else if (Array.isArray(promosInfo)) {
      promos = promosInfo;
    }

    let targetPromo;
    if (id) {
       targetPromo = promos.find(p => p.id === id);
    } else {
       targetPromo = promos.find(p => p.isWelcomePromo);
    }

    if (!targetPromo || !targetPromo.image) {
      return new NextResponse('No promo image found', { status: 404 });
    }

    // Strip the data URI prefix and decode base64 to binary
    const base64Data = targetPromo.image.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // Detect content type from data URI
    const mimeMatch = targetPromo.image.match(/^data:(image\/\w+);base64,/);
    const contentType = mimeMatch ? mimeMatch[1] : 'image/jpeg';

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'public, max-age=300',
        'Access-Control-Allow-Origin': '*',
      }
    });
  } catch (err) {
    console.error('Error serving promo image:', err);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
