import { redis } from '@/lib/redis';
import { NextResponse } from 'next/server';

const GASTOS_KEY = 'diablito:gastos';

// GET → return all gastos
export async function GET() {
  try {
    const raw = await redis.get(GASTOS_KEY);
    const gastos = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
    return NextResponse.json({ success: true, data: gastos });
  } catch (error) {
    console.error('Error fetching gastos:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST → add a new gasto
export async function POST(req) {
  try {
    const body = await req.json();
    const { proveedor, monto, imagen, fecha } = body;

    if (!proveedor || monto == null) {
      return NextResponse.json({ success: false, error: 'Proveedor y monto son requeridos' }, { status: 400 });
    }

    const raw = await redis.get(GASTOS_KEY);
    const gastos = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];

    const newGasto = {
      id: `gasto_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      proveedor: proveedor.trim(),
      monto: parseFloat(monto),
      imagen: imagen || null,  // base64 data URL
      fecha: fecha || new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    gastos.unshift(newGasto); // newest first
    await redis.set(GASTOS_KEY, gastos);

    return NextResponse.json({ success: true, data: newGasto });
  } catch (error) {
    console.error('Error saving gasto:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE → remove a gasto by id
export async function DELETE(req) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ success: false, error: 'ID requerido' }, { status: 400 });
    }

    const raw = await redis.get(GASTOS_KEY);
    let gastos = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];

    gastos = gastos.filter(g => g.id !== id);
    await redis.set(GASTOS_KEY, gastos);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting gasto:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
