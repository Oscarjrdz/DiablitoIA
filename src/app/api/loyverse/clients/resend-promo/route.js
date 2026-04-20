import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { generateFolio, buildPromoText } from '@/lib/folio';

export async function POST(req) {
  try {
    const { phone, promoId } = await req.json();
    if (!phone) return NextResponse.json({ error: 'WhatsApp number missing' }, { status: 400 });

    let cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone.startsWith('52')) cleanPhone = '52' + cleanPhone;

    const promosInfo = await redis.get('promotions');
    let promos = typeof promosInfo === 'string' ? JSON.parse(promosInfo) : (promosInfo || []);
    
    // Si viene promoId, usa esa promo específica. Si no, usa la de bienvenida (fallback).
    let targetPromo;
    if (promoId) {
      targetPromo = promos.find(p => p.id === promoId);
    }
    if (!targetPromo) {
      targetPromo = promos.find(p => p.isWelcomePromo);
    }
    
    if (!targetPromo) return NextResponse.json({ error: 'No se encontró la promoción' }, { status: 404 });

    const configStr = await redis.get('wapp_config');
    let wConfig = typeof configStr === 'string' ? JSON.parse(configStr) : (configStr || {});
    
    if (!wConfig.wappInstance || !wConfig.wappToken) {
       return NextResponse.json({ error: 'Gateway not configured' }, { status: 500 });
    }

    // Generate NEW folio for this send
    const folio = generateFolio();
    const { text: promoTextRaw, validDate } = buildPromoText(targetPromo.text, folio, targetPromo.validFrom, targetPromo.validityDuration);
    const promoText = promoTextRaw.replace(/{nombre_de_cliente}/g, '');
    
    // Si la promo tiene un itemName personalizado, guardar en Redis para el folio
    if (targetPromo.itemName) {
      await redis.set(`folio_item_name_${folio}`, targetPromo.itemName);
    }
    
    await redis.set(`promo_folio_${cleanPhone}`, folio);
    await redis.set(`folio_owner_${folio}`, cleanPhone);
    await redis.set(`folio_valid_date_${folio}`, validDate);

    const toPhoneUri = `${cleanPhone}@c.us`;
    const baseUrl = `https://gatewaywapp-production.up.railway.app/${wConfig.wappInstance}`;
    
    let endpoint = '/messages/chat';
    let bodyPayload = { token: wConfig.wappToken, to: toPhoneUri, body: promoText };

    if (targetPromo.image) {
      endpoint = '/messages/image';
      bodyPayload = { 
        token: wConfig.wappToken, 
        to: toPhoneUri, 
        image: `https://global-sales-prediction.vercel.app/api/promotions/image?ts=${Date.now()}`, 
        caption: promoText 
      };
    }

    let res = await fetch(baseUrl + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyPayload)
    });

    // FALLBACK: Si subida de imagen falla (muy común por IP proxy / WA media bans), reenviar texto
    if (!res.ok && endpoint === '/messages/image') {
       res = await fetch(baseUrl + '/messages/chat', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ token: wConfig.wappToken, to: toPhoneUri, body: promoText })
       });
    }

    if (res.ok) {
      const sendRes = await res.json();
      await redis.set(`promo_pos_${cleanPhone}`, 'naranja');
      const msgId = sendRes.messageId || sendRes?.key?.id || sendRes?.data?.key?.id;
      if (msgId) await redis.set(`promo_msg_${msgId}`, cleanPhone);
      return NextResponse.json({ success: true, folio });
    } else {
      await redis.set(`promo_pos_${cleanPhone}`, 'rojo');
      const errorText = await res.text();
      return NextResponse.json({ error: 'Failed to send: ' + errorText }, { status: 500 });
    }
  } catch (error) {
    console.error('Error resending promo:', error);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}
