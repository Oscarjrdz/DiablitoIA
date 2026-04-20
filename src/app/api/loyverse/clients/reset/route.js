import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function POST(req) {
  try {
    const token = req.headers.get('Authorization');
    if (!token) return NextResponse.json({ error: 'Authorization token required' }, { status: 401 });

    const { phone, id } = await req.json();
    if (!phone) return NextResponse.json({ error: 'Phone missing' }, { status: 400 });

    let cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone.startsWith('52')) cleanPhone = '52' + cleanPhone;

    const phone10 = cleanPhone.slice(-10);
    const folio = await redis.get(`promo_folio_${cleanPhone}`);
    
    let keysToDelete = [];
    try {
        const dynamicKeys = await redis.keys(`*${phone10}*`);
        if (dynamicKeys && Array.isArray(dynamicKeys)) {
            keysToDelete = keysToDelete.concat(dynamicKeys);
        }
        if (folio) {
            const dynamicFolioKeys = await redis.keys(`*${folio}*`);
            if (dynamicFolioKeys && Array.isArray(dynamicFolioKeys)) {
                keysToDelete = keysToDelete.concat(dynamicFolioKeys);
            }
        }
    } catch (err) {
        console.warn('redis.keys not supported or failed', err);
    }

    const manualKeys = [
        `promo_pos_${cleanPhone}`,
        `client_store_${cleanPhone}`,
        `promo_folio_${cleanPhone}`,
        `chat_hist_${phone}`,
        `chat_hist_${cleanPhone}`,
        `chat_hist_${cleanPhone}@c.us`,
        `user_state_${phone}`,
        `user_state_${cleanPhone}`,
        `coupon_sending_${cleanPhone}`,
        `loyverse_visits_${cleanPhone}`,
        `client_name_${cleanPhone}`,
        `client_points_${cleanPhone}`,
        `client_registered_${cleanPhone}`,
        `pending_folio_store_${cleanPhone}`
    ];

    if (folio) {
        manualKeys.push(
            `folio_owner_${folio}`,
            `folio_valid_date_${folio}`,
            `folio_item_name_${folio}`,
            `folio_item_id_${folio}`,
            `folio_status_${folio}`,
            `folio_promo_id_${folio}`
        );
    }

    for (let v = 1; v <= 50; v++) { manualKeys.push(`promo_sent_${cleanPhone}_v_${v}`); }
    for (const s of [100, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000]) { manualKeys.push(`promo_sent_${cleanPhone}_s_${s}`); }

    keysToDelete = [...new Set([...keysToDelete, ...manualKeys])];

    for (const key of keysToDelete) {
        if (key.includes('reset_lock_')) continue;
        await redis.del(key);
    }
    
    // REPELLER FANTASMAS 5 minutos (Evita cupon de bienvenida de webhooks viejos)
    await redis.setex(`reset_lock_${cleanPhone}`, 15, '1');

    const loyverseToken = await redis.get('loyverse_token');
    let deletedFromLoyverse = false;

    if (loyverseToken) {
       try {
          if (id) {
               await fetch(`https://api.loyverse.com/v1.0/customers/${id}`, {
                  method: 'DELETE',
                  headers: { Authorization: `Bearer ${loyverseToken}` }
               });
               deletedFromLoyverse = true;
          } else {
              let cursor = null;
              let keepSearching = true;
              while (keepSearching) {
                  let url = 'https://api.loyverse.com/v1.0/customers?limit=250';
                  if (cursor) url += `&cursor=${cursor}`;
                  const searchRes = await fetch(url, {
                      headers: { Authorization: `Bearer ${loyverseToken}` }
                  });
                  if (!searchRes.ok) break;
                  const searchData = await searchRes.json();
                  const matches = (searchData.customers || []).filter(c => {
                      if (!c.phone_number) return false;
                      const cand = c.phone_number.replace(/\D/g, '');
                      const last10 = cleanPhone.slice(-10);
                      return cand.endsWith(last10);
                  });
                  
                  for (const match of matches) {
                      await fetch(`https://api.loyverse.com/v1.0/customers/${match.id}`, {
                          method: 'DELETE',
                          headers: { Authorization: `Bearer ${loyverseToken}` }
                      });
                      deletedFromLoyverse = true;
                  }
                  cursor = searchData.cursor || null;
                  keepSearching = !!cursor;
              }
          }
       } catch(e) { console.error('Reset delete customer error:', e); }
    }

    return NextResponse.json({ success: true, message: 'Deep reset completed', deletedFromLoyverse });
  } catch (err) {
    console.error('Reset Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}