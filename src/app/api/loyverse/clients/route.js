import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { generateFolio, buildPromoText } from '@/lib/folio';

const LOYVERSE_API_URL = 'https://api.loyverse.com/v1.0/customers';

export async function GET(req) {
  try {
    const token = req.headers.get('Authorization');
    if (!token) return NextResponse.json({ error: 'Authorization token required' }, { status: 401 });

    const headers = { 'Authorization': token };
    
    const res = await fetch(`${LOYVERSE_API_URL}?limit=250`, { headers });
    if (!res.ok) throw new Error('Failed to fetch customers');
    
    const data = await res.json();
    
    const customers = await Promise.all((data.customers || []).map(async (c) => {
      let tienda = '';
      if (c.note && c.note.includes('Tienda:')) {
        const match = c.note.match(/Tienda:\s*(.+)(?:\n|$)/);
        if (match) tienda = match[1].trim();
      }
      
      let cuponStatus = 'rojo';
      if (c.phone_number) {
         let cleanPhone = '52' + c.phone_number.replace(/\D/g, '').slice(-10);
         const status = await redis.get(`promo_pos_${cleanPhone}`);
         if (status) cuponStatus = status;
         
         const rdStore = await redis.get(`client_store_${cleanPhone}`);
         if (!tienda && rdStore) tienda = rdStore;
      }

      return { ...c, tienda, cuponStatus };
    }));

    return NextResponse.json({ success: true, data: customers });
  } catch (error) {
    console.error('Error fetching customers:', error);
    return NextResponse.json({ error: 'Failed to fetch customers' }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const token = req.headers.get('Authorization');
    if (!token) return NextResponse.json({ error: 'Authorization token required' }, { status: 401 });

    const body = await req.json();
    const headers = { 'Authorization': token, 'Content-Type': 'application/json' };

    const noteData = `Calle: ${body.calle || ''}\nNúmero: ${body.numero_casa || ''}\nColonia: ${body.colonia || ''}\nMunicipio: ${body.municipio || ''}\nTienda: ${body.tienda || ''}`.trim();

    let addressParts = [body.calle, body.numero_casa, body.colonia].filter(Boolean);
    let addressString = addressParts.join(', ').trim();

    // Deduplication by WhatsApp
    let existingId = null;
    let existingData = {};
    if (body.whatsapp) {
       const resAll = await fetch(`${LOYVERSE_API_URL}?limit=250`, { headers });
       if (resAll.ok) {
          const allData = await resAll.json();
          const cleanNew = body.whatsapp.replace(/\D/g, '');
          const existing = (allData.customers || []).find(c => {
             if (!c.phone_number) return false;
             const cand = c.phone_number.replace(/\D/g, '');
             const last10 = cleanNew.slice(-10);
             return cand.endsWith(last10);
          });
          if (existing) {
             existingId = existing.id;
             existingData = existing;
          }
       }
    }

    const customerData = {
      name: body.nombre || 'Sin nombre',
      note: (existingData.note && !body.tienda) ? existingData.note : noteData
    };
    // Candado super estricto: Si The customer already exists under that WhatsApp, fail out.
    if (existingId) {
       return NextResponse.json({ error: 'Ya existe un cliente con este número de WhatsApp. Modifica el original o elimina el preexistente.' }, { status: 400 });
    }
    
    // if (existingId) customerData.id = existingId; // No long allowed to merge via creation point.
    if (body.whatsapp) customerData.phone_number = body.whatsapp.replace(/@c.us/g, '').replace(/@s.whatsapp.net/g, '');
    if (addressString) customerData.address = addressString;
    if (body.municipio) customerData.city = body.municipio;

    const res = await fetch(LOYVERSE_API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(customerData)
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Loyverse API Error: ${errorText}`);
    }
    
    const data = await res.json();
    const isNew = !existingId;

    // Send Welcome WhatsApp only to NEW clients
    if (isNew && body.whatsapp) {
      try {
        const promosInfo = await redis.get('promotions');
        let promos = typeof promosInfo === 'string' ? JSON.parse(promosInfo) : (promosInfo || []);
        const welcomePromo = promos.find(p => p.isWelcomePromo);
        
        if (welcomePromo) {
          // ── Mutex anti-duplicado: evitar que dos llamadas paralelas envíen dos cupones ──
          let cpMutex = '52' + body.whatsapp.replace(/\D/g, '').slice(-10);
          const mutexKey = `coupon_sending_${cpMutex}`;
          // setnx: solo setea si NO existe. Si ya existe, otro proceso ya está enviando.
          const acquired = await redis.setnx(mutexKey, '1');
          if (!acquired) {
            console.log('Mutex activo: cupón ya siendo enviado para', cpMutex);
            return NextResponse.json({ success: true, data, action: 'created', note: 'coupon_deduplicated' });
          }
          // Expira en 30s como fallback de seguridad
          await redis.expire(mutexKey, 30);
          const configStr = await redis.get("wapp_config");
          let wappConfig = typeof configStr === 'string' ? JSON.parse(configStr) : (configStr || {});
          
          const wappInstance = wappConfig.wappInstance;
          const wappToken = wappConfig.wappToken;
          
          if (wappInstance && wappToken) {
            let cleanPhone = '52' + body.whatsapp.replace(/\D/g, '').slice(-10);
            const toPhoneUri = `${cleanPhone}@c.us`;

            // Generate unique folio for this client
            const folio = generateFolio();
            const { text: promoTextRaw, validDate } = buildPromoText(welcomePromo.text, folio, welcomePromo.validFrom, welcomePromo.validityDuration);
            const promoText = promoTextRaw.replace(/{nombre_de_cliente}/g, body.nombre || '');
            
            // Save folio in Redis for tracking
            await redis.set(`promo_folio_${cleanPhone}`, folio);
    await redis.set(`folio_owner_${folio}`, cleanPhone);
    await redis.set(`folio_valid_date_${folio}`, validDate);

            let endpoint = '/messages/chat';
            let reqBody = { token: wappToken, to: toPhoneUri, body: promoText };

            if (welcomePromo.image) {
              endpoint = '/messages/image';
              reqBody = { 
                token: wappToken, 
                to: toPhoneUri, 
                image: `https://global-sales-prediction.vercel.app/api/promotions/image?id=${welcomePromo.id}&ts=${Date.now()}`, 
                caption: promoText 
              };
            }

            const gwRes = await fetch(`https://gatewaywapp-production.up.railway.app/${wappInstance}${endpoint}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(reqBody)
            });
            
            if (gwRes.ok) {
              const sendRes = await gwRes.json();
              await redis.set(`promo_pos_${cleanPhone}`, 'naranja');
              const msgId = sendRes.messageId || sendRes?.key?.id || sendRes?.data?.key?.id;
              if (msgId) await redis.set(`promo_msg_${msgId}`, cleanPhone);
            } else {
               await redis.set(`promo_pos_${cleanPhone}`, 'rojo');
            }
          // Liberar el mutex al terminar
          await redis.del(mutexKey);
        }
        }
      } catch (e) {
        console.error('Error sending welcome WhatsApp msg:', e);
      }
    }

    return NextResponse.json({ success: true, data, action: isNew ? 'created' : 'updated' });
  } catch (error) {
    console.error('Error creating customer:', error);
    return NextResponse.json({ error: error.message || 'Failed to create customer' }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    const token = req.headers.get('Authorization');
    if (!token) return NextResponse.json({ error: 'Authorization token required' }, { status: 401 });
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const res = await fetch(`${LOYVERSE_API_URL}/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': token }
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Loyverse API Error: ${errorText}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting customer:', error);
    return NextResponse.json({ error: error.message || 'Failed to delete customer' }, { status: 500 });
  }
}
