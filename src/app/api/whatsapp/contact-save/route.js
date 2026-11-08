import { NextResponse } from 'next/server';
import { saveContactToDevice } from '@/lib/contacts';

export async function POST(req) {
  try {
    const { phone, fullName, firstName } = await req.json();
    if (!phone) return NextResponse.json({ success: false, error: 'phone requerido' });
    if (!fullName?.trim()) return NextResponse.json({ success: false, error: 'fullName requerido' });

    const result = await saveContactToDevice({ phone, fullName, firstName });
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error });
    }
    return NextResponse.json({ success: true, jid: result.jid });
  } catch (e) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
