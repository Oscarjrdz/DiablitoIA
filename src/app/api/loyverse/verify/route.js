import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const { token } = await req.json();

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    // Verify token by making a lightweight request to Loyverse API
    const response = await fetch('https://api.loyverse.com/v1.0/employees', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.ok) {
      return NextResponse.json({ success: true, message: 'Token is valid' });
    } else {
      const errorData = await response.json();
      return NextResponse.json(
        { error: errorData.errors?.[0]?.details || 'Invalid token or unauthorized' }, 
        { status: response.status }
      );
    }
  } catch (error) {
    return NextResponse.json({ error: 'Server error during verification' }, { status: 500 });
  }
}
