import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

const KEY = 'suggestive_messages';

async function load() {
  const raw = await redis.get(KEY);
  return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : [];
}

export async function GET() {
  try {
    return NextResponse.json({ success: true, messages: await load() });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const { name, text, image } = await req.json();
    if (!name?.trim() || !text?.trim()) return NextResponse.json({ success: false, error: 'name y text requeridos' }, { status: 400 });
    const msgs = await load();
    const newMsg = { id: Date.now().toString(), name: name.trim(), text: text.trim(), image: image || null };
    msgs.push(newMsg);
    await redis.set(KEY, JSON.stringify(msgs));
    return NextResponse.json({ success: true, message: newMsg });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function PATCH(req) {
  try {
    const { id, name, text, image } = await req.json();
    if (!id) return NextResponse.json({ success: false, error: 'id requerido' }, { status: 400 });
    const msgs = await load();
    const idx = msgs.findIndex(m => m.id === id);
    if (idx === -1) return NextResponse.json({ success: false, error: 'No encontrado' }, { status: 404 });
    if (name?.trim()) msgs[idx].name = name.trim();
    if (text?.trim()) msgs[idx].text = text.trim();
    if (image !== undefined) msgs[idx].image = image;
    await redis.set(KEY, JSON.stringify(msgs));
    return NextResponse.json({ success: true, message: msgs[idx] });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ success: false, error: 'id requerido' }, { status: 400 });
    const msgs = (await load()).filter(m => m.id !== id);
    await redis.set(KEY, JSON.stringify(msgs));
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
