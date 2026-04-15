import { NextResponse } from 'next/server';

export async function GET(req) {
  try {
    const token = req.headers.get('Authorization');
    
    if (!token) {
      return NextResponse.json({ error: 'Authorization token required' }, { status: 401 });
    }

    const headers = { 'Authorization': token };

    const storesRes = await fetch('https://api.loyverse.com/v1.0/stores', { headers });
    if (!storesRes.ok) throw new Error('Failed to fetch stores');
    
    const { stores } = await storesRes.json();

    return NextResponse.json({
      success: true,
      data: { stores }
    });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to fetch stores' }, { status: 500 });
  }
}
