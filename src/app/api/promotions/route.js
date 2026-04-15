import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

// GET all promotions
export async function GET() {
  try {
    const data = await redis.get('promotions');
    let promos = [];
    if (typeof data === 'string') {
      promos = JSON.parse(data);
    } else if (Array.isArray(data)) {
      promos = data;
    }
    
    // Inject runtime statistics
    for (const p of promos) {
        if (!p.id) continue;
        const s = await redis.get(`promo_sent_count_${p.id}`);
        const r = await redis.get(`promo_redeem_count_${p.id}`);
        p.sentCount = s ? parseInt(s) : 0;
        p.redeemCount = r ? parseInt(r) : 0;
    }
    
    return NextResponse.json({ success: true, data: promos });
  } catch (error) {
    console.error('Error fetching promotions:', error);
    return NextResponse.json({ error: 'Failed to fetch promotions' }, { status: 500 });
  }
}

// POST a new promotion
export async function POST(req) {
  try {
    const body = await req.json();
    const data = await redis.get('promotions');
    let promos = [];
    if (typeof data === 'string') {
      promos = JSON.parse(data);
    } else if (Array.isArray(data)) {
      promos = data;
    }

    const newPromo = {
      id: Date.now().toString(),
      text: body.text || '',
      image: body.image || '',
      folio: body.folio || '',
      isWelcomePromo: body.isWelcomePromo || false,
      visitTriggers: body.visitTriggers || '',
      spendTriggers: body.spendTriggers || '',
      itemName: body.itemName || 'Burger Gratis',
      validFrom: body.validFrom || 'hoy',
      validityDuration: body.validityDuration || '1',
      createdAt: new Date().toISOString()
    };

    // If this is set as welcome promo, unset others
    if (newPromo.isWelcomePromo) {
      promos = promos.map(p => ({ ...p, isWelcomePromo: false }));
    }

    promos.push(newPromo);
    await redis.set('promotions', JSON.stringify(promos));

    return NextResponse.json({ success: true, data: promos });
  } catch (error) {
    console.error('Error creating promotion:', error);
    return NextResponse.json({ error: 'Failed to create promotion' }, { status: 500 });
  }
}

// PUT (update) a promotion
export async function PUT(req) {
  try {
    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    const data = await redis.get('promotions');
    let promos = [];
    if (typeof data === 'string') {
      promos = JSON.parse(data);
    } else if (Array.isArray(data)) {
      promos = data;
    }

    if (body.isWelcomePromo) {
      promos = promos.map(p => ({ ...p, isWelcomePromo: false }));
    }

    promos = promos.map(p => p.id === body.id ? { ...p, ...body } : p);
    await redis.set('promotions', JSON.stringify(promos));

    return NextResponse.json({ success: true, data: promos });
  } catch (error) {
    console.error('Error updating promotion:', error);
    return NextResponse.json({ error: 'Failed to update promotion' }, { status: 500 });
  }
}

// DELETE a promotion
export async function DELETE(req) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 });

    const data = await redis.get('promotions');
    let promos = [];
    if (typeof data === 'string') {
      promos = JSON.parse(data);
    } else if (Array.isArray(data)) {
      promos = data;
    }

    promos = promos.filter(p => p.id !== id);
    await redis.set('promotions', JSON.stringify(promos));

    return NextResponse.json({ success: true, data: promos });
  } catch (error) {
    console.error('Error deleting promotion:', error);
    return NextResponse.json({ error: 'Failed to delete promotion' }, { status: 500 });
  }
}
