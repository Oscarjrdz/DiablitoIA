import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { generateFolio, buildPromoText } from '@/lib/folio';

const FOLIO_REGEX = /^[A-Z]\d{3,4}$/i;
const FOLIO_EXTRACT = /\b([A-Z]\d{3,4})\b/i;

async function getLoyverseStoresContext(storeHint, token) {
  try {
    const res = await fetch('https://api.loyverse.com/v1.0/stores', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return null;
    const data = await res.json();
    const hint = storeHint.toUpperCase();
    const allStores = data.stores || [];
    const targetStore = allStores.find(s => s.name.toUpperCase().includes(hint));
    return targetStore ? { targetStore, allStores } : null;
  } catch { return null; }
}

async function createLoyverseItem(folio, targetStoreId, allStores, token) {
  const customPrefix = (await redis.get(`folio_item_name_${folio}`)) || 'Burger Gratis';
  const itemName = `${customPrefix} ${folio}`;
  
  const storePrices = allStores.map(s => ({
    store_id: s.id,
    pricing_type: 'FIXED',
    price: 0,
    available_for_sale: s.id === targetStoreId
  }));

  const payload = {
    item_name: itemName,
    reference_id: `coupon-${folio.toLowerCase()}`,
    category_id: 'f13c261b-1c35-4f17-8cc6-d7dcce5c94b0',
    sold_by_weight: false,
    variants: [{
      variant_name: 'Default',
      sku: folio.toUpperCase(),
      cost: 0,
      default_pricing_type: 'FIXED',
      default_price: 0,
      stores: storePrices
    }]
  };

  const res = await fetch('https://api.loyverse.com/v1.0/items', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  return { ok: res.ok, data, itemName };
}

async function sendWhatsApp(to, body, cfg) {
  await fetch(`https://gatewaywapp-production.up.railway.app/${cfg.wappInstance}/messages/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: cfg.wappToken, to, body })
  });
}

export async function POST(req) {
  try {
    
    const payload = await req.json();
    // Debug point: Save last payload in Redis
    await redis.set('DEBUG_LAST_PAYLOAD', payload);


    // Ack → semaphore verde
    if (payload.event_type === 'message_ack' || payload.event_type === 'messages.update') {
      const msgData = payload.data || {};
      const msgKey = msgData.key || (Array.isArray(msgData) ? msgData[0]?.key : null);
      if (msgKey?.id) {
        const statusId = msgData.update?.status || (Array.isArray(msgData) ? msgData[0]?.update?.status : null);
        if ([3, 4, 'READ'].includes(statusId)) {
          const phone = await redis.get(`promo_msg_${msgKey.id}`);
          if (phone) await redis.set(`promo_pos_${phone}`, 'verde');
        }
      }
      return NextResponse.json({ success: true });
    }

    if (payload.event_type !== 'message_received' || (!payload.data?.from && !payload.data?.key)) {
      return NextResponse.json({ success: true });
    }

    const fromMe = payload.data.fromMe !== undefined ? payload.data.fromMe : payload.data.key?.fromMe;
    if (fromMe) return NextResponse.json({ success: true });

    let bodyStr = payload.data.body || payload.data.__raw?.message?.conversation || payload.data.__raw?.message?.extendedTextMessage?.text || '';
    
    // Si mandan un Sticker pero no hay texto, lo tratamos como un saludo inicial (HOLA) para que el Bot despierte
    const isSticker = payload.data.type === 'sticker' || payload.data.messageType === 'sticker' || !!payload.data.__raw?.message?.stickerMessage;
    if (isSticker && !bodyStr) {
        bodyStr = 'HOLA';
    }
    
    let isManagerImageFlow = false;
    const textMsgRaw = bodyStr.trim().toUpperCase();
    let phoneId = payload.data.from || payload.data.key?.remoteJid || payload.data.__raw?.key?.remoteJidAlt || payload.data.__raw?.key?.remoteJid;
    
    if (phoneId && phoneId.includes('@s.whatsapp.net')) {
      phoneId = phoneId.replace('@s.whatsapp.net', '@c.us');
    }
    
    let cleanPhoneGlobal = phoneId ? '52' + phoneId.replace(/\D/g, '').slice(-10) : '';
    let textMsg = textMsgRaw;

    // ── 📸 MANEJO DE IMÁGENES PARA EXTRAER FOLIO ──
    const isImage = payload.data.type === 'image' || !!payload.data.__raw?.message?.imageMessage;
    // Loguear intento
    if (isImage) {
        await redis.lpush('debug_image_logs', JSON.stringify({ step: 'START', ts: Date.now(), mediaType: typeof payload.data.media, mediaVal: payload.data.media ? payload.data.media.substring(0,50) : null }));
    }

    if (isImage && payload.data.media) {
       try {
           const imgRes = await fetch(payload.data.media);
           await redis.lpush('debug_image_logs', JSON.stringify({ step: 'FETCH_MEDIA', ok: imgRes.ok, status: imgRes.status }));
           if (imgRes.ok) {
               const arrayBuffer = await imgRes.arrayBuffer();
               const base64Image = Buffer.from(arrayBuffer).toString('base64');
               const configStr = await redis.get('wapp_config');
               const cfg = typeof configStr === 'string' ? JSON.parse(configStr) : (configStr || {});
               const aiToken = cfg.aiToken;
               if (aiToken) {
                   await redis.lpush('debug_image_logs', JSON.stringify({ step: 'CALL_GEMINI', len: base64Image.length }));
                   const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${aiToken}`, {
                       method: 'POST',
                       headers: { 'Content-Type': 'application/json' },
                       body: JSON.stringify({
                           contents: [{
                               parts: [
                                   { text: "Busca un código de 1 letra y 3 o 4 números (ej F666, A1234, X9876). Responde SOLO con el código exacto, o NO_FOLIO si no encuentras ninguno." },
                                   { inlineData: { mimeType: "image/jpeg", data: base64Image } }
                               ]
                           }],
                           generationConfig: { maxOutputTokens: 50, temperature: 0 }
                       })
                   });
                   await redis.lpush('debug_image_logs', JSON.stringify({ step: 'GEMINI_RESPONSE', ok: geminiRes.ok, status: geminiRes.status }));
                   if (geminiRes.ok) {
                       const geminiData = await geminiRes.json();
                       const reply = (geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '').trim().toUpperCase();
                       await redis.lpush('debug_image_logs', JSON.stringify({ step: 'GEMINI_TEXT', text: reply }));
                       const folioMatch = reply.match(FOLIO_EXTRACT) || (FOLIO_REGEX.test(reply) ? [reply] : null);
                       if (folioMatch) {
                           let extractedFolio = (folioMatch[1] || folioMatch[0]).toUpperCase();
                           await redis.set(`pending_folio_store_${cleanPhoneGlobal}`, extractedFolio);
                           const menuText = `📸 ¡Folio *${extractedFolio}* detectado en la imagen!\nPara activarlo, por favor selecciona en qué sucursal te encuentras respondiendo con el *número*:\n\n1️⃣ - Bosques\n2️⃣ - Valle de Lincoln\n3️⃣ - San Blas\n4️⃣ - Titanio\n5️⃣ - Palmas\n6️⃣ - Cordillera\n\n*(O responde ❌ CANCELAR si detecté mal el folio)*`;
                           await sendWhatsApp(phoneId, menuText, cfg);
                           return NextResponse.json({ success: true, note: 'image_folio_detected' });
                       }
                   } else {
                       const errT = await geminiRes.text();
                       await redis.lpush('debug_image_logs', JSON.stringify({ step: 'GEMINI_FAIL', text: errT }));
                   }
               }
           }
       } catch(err) { 
           console.error("Error procesando imagen para folio:", err); 
           await redis.lpush('debug_image_logs', JSON.stringify({ step: 'ERROR', error: err.message }));
       }
       // Si no es folio o falla, retornar
       return NextResponse.json({ success: true });
    }

    // ── ⏳ INTERCEPCIÓN DE FOLIO PENDIENTE ──
    const pendingFolio = await redis.get(`pending_folio_store_${cleanPhoneGlobal}`);
    if (pendingFolio && textMsg) {
        const configStr = await redis.get('wapp_config');
        const cfg = typeof configStr === 'string' ? JSON.parse(configStr) : (configStr || {});
        
        if (textMsg === 'CANCELAR' || textMsg === '❌' || textMsg === 'X' || textMsg === 'NO') {
            await redis.del(`pending_folio_store_${cleanPhoneGlobal}`);
            await sendWhatsApp(phoneId, '❌ Activación cancelada.', cfg);
            return NextResponse.json({ success: true });
        }
        
        const storeMap = { '1': 'Bosques', '2': 'Valle de Lincoln', '3': 'San Blas', '4': 'Titanio', '5': 'Palmas', '6': 'Cordillera' };
        const selNum = textMsg.replace(/\D/g, ''); 
        const selectedStore = storeMap[textMsg] || storeMap[selNum];
        
        if (selectedStore) {
            await redis.del(`pending_folio_store_${cleanPhoneGlobal}`);
            textMsg = `${pendingFolio} ${selectedStore}`; // Re-inyecta el string
            isManagerImageFlow = true;
        } else {
             await sendWhatsApp(phoneId, '⚠️ Opción no válida. Por favor responde con un número del 1 al 6 o envía CANCELAR.', cfg);
             return NextResponse.json({ success: true });
        }
    }

    if (!textMsg) return NextResponse.json({ success: true });
    
    // Log the entire webhook payload for debugging
    await redis.set('last_webhook_payload', JSON.stringify(payload));


    const senderId = payload.data.__raw?.key?.participantAlt || payload.data.__raw?.key?.remoteJidAlt || payload.data.author || payload.data.participant || payload.data.__raw?.key?.participant || payload.data.__raw?.participant || phoneId || '';

    // ── 📊 VENTAS DE HOY COMMAND ──
    const OWNER_LAST10 = '8116038195';
    let cleanPhoneCheck = '52' + senderId.replace(/\D/g, '').slice(-10);

    // Permitir VINCULAR GRUPO
    if (cleanPhoneCheck.slice(-10) === OWNER_LAST10 && textMsg === 'VINCULAR GRUPO') {
        const configStr = await redis.get('wapp_config');
        const cfg = typeof configStr === 'string' ? JSON.parse(configStr) : (configStr || {});
        const isGroup = (payload.data.__raw && payload.data.__raw.key && payload.data.__raw.key.remoteJid && payload.data.__raw.key.remoteJid.includes('@g.us'));
        const activeGroupId = isGroup ? payload.data.__raw.key.remoteJid : (phoneId.includes('@g.us') ? phoneId : null);

        await sendWhatsApp('5218116038195@c.us', '*🔧 DEBUG DIABLITO:*\nactiveGroupId: ' + (activeGroupId || 'NULO') + '\nDesde: ' + phoneId + '\nSender: ' + senderId + '\nMsg: ' + textMsg, cfg);
        
        if (activeGroupId) {
            await redis.set('ventas_grupo_id', activeGroupId);
            await sendWhatsApp(activeGroupId, '✅ Grupo vinculado con éxito. Los reportes automáticos se enviarán aquí.', cfg);
        } else {
            await sendWhatsApp(phoneId, '❌ Debes enviar este comando DENTRO de un grupo de WhatsApp.', cfg);
        }
        return NextResponse.json({ success: true });
    }

    if (cleanPhoneCheck.slice(-10) === OWNER_LAST10 && (textMsg === 'GRUPO' || textMsg.includes('VENTAS DE HOY') || textMsg.includes('VENTAS DEL DIA') || textMsg.includes('VENTAS DEL DÍA') || textMsg === 'VENTAS AYER')) {
       const configStr = await redis.get('wapp_config');
       const cfg = typeof configStr === 'string' ? JSON.parse(configStr) : (configStr || {});
       const loyverseToken = await redis.get('loyverse_token');
       
       if (!loyverseToken) {
           await sendWhatsApp(phoneId, '❌ No hay token de Loyverse configurado.', cfg);
           return NextResponse.json({ success: true });
       }

       try {
           const authH = { Authorization: `Bearer ${loyverseToken}` };
           const storesRes = await fetch('https://api.loyverse.com/v1.0/stores', { headers: authH });
           const storesPayload = await storesRes.json();
           const stores = (storesPayload.stores || []).filter(s => !s.name.toLowerCase().includes('prueba'));

           const now = new Date();
           const mtyDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Monterrey' }));
           if (textMsg === 'VENTAS AYER') {
               mtyDate.setDate(mtyDate.getDate() - 1);
           }
           const mtyStr = mtyDate.toLocaleDateString('en-CA');
           const [ty, tm, td] = mtyStr.split('-').map(Number);
           const fetchStart = new Date(Date.UTC(ty, tm - 1, td - 1, 12, 0, 0)).toISOString();
           const fetchEnd = new Date(Date.UTC(ty, tm - 1, td + 1, 12, 0, 0)).toISOString();

           let allReceipts = [], cur = null, more = true;
           while (more) {
               let url = `https://api.loyverse.com/v1.0/receipts?created_at_min=${fetchStart}&updated_at_max=${fetchEnd}&limit=250`;
               if (cur) url += `&cursor=${cur}`;
               const rr = await fetch(url, { headers: authH });
               const rd = await rr.json();
               if (rd.receipts?.length) allReceipts = allReceipts.concat(rd.receipts);
               cur = rd.cursor || null;
               more = !!cur;
           }

           const todayReceipts = allReceipts.filter(r => {
               if (r.cancelled_at) return false;
               return new Date(r.created_at).toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' }) === mtyStr;
           });

           let totalV = 0, totalT = 0, totalR = 0;
           const ps = {};
           stores.forEach(s => { if (s.name.toLowerCase().includes('prueba')) return; ps[s.id] = { name: s.name, v: 0, t: 0, lastTime: null }; });

           todayReceipts.forEach(r => {
               const isRef = r.receipt_type === 'REFUND';
               const v = Math.abs(r.total_money || 0) + Math.abs(r.total_discount || 0);
               if (isRef) { 
                   totalR += Math.abs(r.total_money || 0); 
               } else { 
                   totalV += v; 
                   totalT++; 
                   if (ps[r.store_id]) { 
                       ps[r.store_id].v += v; 
                       ps[r.store_id].t++;
                       const rTime = new Date(r.created_at);
                       if (!ps[r.store_id].lastTime || rTime > ps[r.store_id].lastTime) {
                           ps[r.store_id].lastTime = rTime;
                       }
                   } 
               }
           });

           const tp = totalT > 0 ? totalV / totalT : 0;
           const fmt = n => '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
           const hora = now.toLocaleTimeString('es-MX', { timeZone: 'America/Monterrey', hour: '2-digit', minute: '2-digit', hour12: false });

           const isGrupo = textMsg === 'GRUPO';
           let msg = '';
           if (isGrupo) {
               msg += `👥 *REPORTE GRUPAL*\n`;
               msg += `📅 ${mtyStr} •  ⏰ ${hora} hrs\n\n`;
           } else {
               msg += `📊 *REPORTE DE VENTAS — ${textMsg === 'VENTAS AYER' ? 'AYER' : 'HOY'}*\n`;
               msg += `📅 ${mtyStr} •  ⏰ ${hora} hrs\n`;
               msg += `━━━━━━━━━━━━━━━━━━\n\n`;
               msg += `💰 *Venta Total:* ${fmt(totalV)}\n`;
               msg += `🧾 *Tickets:* ${totalT}\n`;
               msg += `🎯 *Ticket Promedio:* ${fmt(tp)}\n`;
               if (totalR > 0) msg += `🔴 *Reembolsos:* ${fmt(totalR)}\n`;
               msg += `\n━━━━━━━━━━━━━━━━━━\n`;
               msg += `🏪 *POR SUCURSAL*\n━━━━━━━━━━━━━━━━━━\n\n`;
           }

           const emojis = ['🔵', '🟢', '🟡', '🟠', '🟣', '🔴'];
           const activeStores = Object.values(ps).filter(s => s.t > 0).sort((a, b) => b.t - a.t);
           
           activeStores.forEach((s, i) => {
               let ltStr = "N/A";
               if (s.lastTime) {
                   ltStr = s.lastTime.toLocaleTimeString('es-MX', { timeZone: 'America/Monterrey', hour: '2-digit', minute: '2-digit', hour12: false }) + ' hrs';
               }
               msg += `${emojis[i % emojis.length]} *${s.name}*\n`;
               if (isGrupo) {
                   msg += `   🧾 ${s.t} tickets\n`;
                   msg += `   ⏱️ Ut: ${ltStr}\n\n`;
               } else {
                   const pct = totalV > 0 ? ((s.v / totalV) * 100).toFixed(1) : '0.0';
                   const stp = s.t > 0 ? s.v / s.t : 0;
                   msg += `   💰 ${fmt(s.v)} (${pct}%)\n`;
                   msg += `   🧾 ${s.t} tickets  |  ⏱️ UT: ${ltStr}\n`;
                   msg += `   🎯 Prom: ${fmt(stp)}\n\n`;
               }
           });

           if (!isGrupo) {
               const noSales = stores.filter(s => !ps[s.id] || ps[s.id].v === 0);
               if (noSales.length > 0) msg += `⚪ *Sin ventas:* ${noSales.map(s => s.name).join(', ')}\n\n`;
           }

           msg += `━━━━━━━━━━━━━━━━━━\n`;
           msg += `⚡ _El Diablito Intelligence_`;

           await sendWhatsApp(phoneId, msg, cfg);
       } catch (err) {
           console.error('❌ Ventas report error:', err.message);
           await sendWhatsApp(phoneId, `❌ Error: ${err.message}`, cfg);
       }
       return NextResponse.json({ success: true });
    }

    if (cleanPhoneCheck.slice(-10) === OWNER_LAST10 && textMsg === 'VENTAS DEL MES') {
       const configStr = await redis.get('wapp_config');
       const cfg = typeof configStr === 'string' ? JSON.parse(configStr) : (configStr || {});
       const lToken = await redis.get('loyverse_token');
       
       if (!lToken) {
           await sendWhatsApp(phoneId, '❌ No hay token de Loyverse.', cfg);
           return NextResponse.json({ success: true });
       }

       try {
           const tzDateStr = new Date().toLocaleString('en-US', { timeZone: 'America/Monterrey' });
           const nowMty = new Date(tzDateStr);
           
           // Start of the month (Monterrey aligned)
           const ds = new Date(nowMty.getFullYear(), nowMty.getMonth(), 1, 0, 0, 0);
           // End of today (Monterrey aligned)
           const de = new Date(nowMty.getFullYear(), nowMty.getMonth(), nowMty.getDate(), 23, 59, 59);
           
           const dbRes = await fetch(`https://global-sales-prediction.vercel.app/api/loyverse/dashboard?start=${ds.toISOString()}&end=${de.toISOString()}`, { 
               headers: { 'Authorization': `Bearer ${lToken}` },
               cache: 'no-store' 
           });
           
           if (!dbRes.ok) {
               await sendWhatsApp(phoneId, '❌ Error conectando al motor analítico del Mes.', cfg);
               return NextResponse.json({ success: true });
           }

           const dbPayload = await dbRes.json();
           const dbData = dbPayload.data || dbPayload;
           
           if (!dbData.kpis || !dbData.storeKpis) {
               await sendWhatsApp(phoneId, '❌ Sin datos del dashboard para este mes.', cfg);
               return NextResponse.json({ success: true });
           }

           const mStr = nowMty.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }).toUpperCase();
           const fmt = n => '$' + n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
           
           let totalV = dbData.kpis.ventasBrutas || 0;
           let totalT = dbData.kpis.totalTickets || 0;
           let tp = totalT > 0 ? totalV / totalT : 0;
           
           let msg = `📊 *REPORTE DE VENTAS — ACUMULADO DEL MES*\n`;
           msg += `📅 ${mStr}\n`;
           msg += `━━━━━━━━━━━━━━━━━━\n\n`;
           msg += `💰 *Venta Total:* ${fmt(totalV)}\n`;
           msg += `🧾 *Tickets:* ${totalT}\n`;
           msg += `🎯 *Ticket Promedio:* ${fmt(tp)}\n`;
           
           if (dbData.kpis.reembolsos > 0) {
               msg += `🔴 *Reembolsos:* ${fmt(dbData.kpis.reembolsos)}\n`;
           }
           
           msg += `\n━━━━━━━━━━━━━━━━━━\n`;
           msg += `🏪 *POR SUCURSAL*\n━━━━━━━━━━━━━━━━━━\n\n`;
           
           const emojis = ['🔵', '🟢', '🟡', '🟠', '🟣', '🔴'];
           const activeStores = dbData.storeKpis.filter(s => s.ventasBrutas > 0 && !s.name.toLowerCase().includes('prueba')).sort((a,b) => b.ventasBrutas - a.ventasBrutas);
           
           activeStores.forEach((s, i) => {
               const pct = totalV > 0 ? ((s.ventasBrutas / totalV) * 100).toFixed(1) : '0.0';
               const stp = s.totalTickets > 0 ? s.ventasBrutas / s.totalTickets : 0;
               msg += `${emojis[i % emojis.length]} *${s.name.trim()}*\n`;
               msg += `   💰 ${fmt(s.ventasBrutas)} (${pct}%)\n`;
               msg += `   🧾 ${s.totalTickets} tickets\n`;
               msg += `   🎯 Prom: ${fmt(stp)}\n\n`;
           });

           msg += `━━━━━━━━━━━━━━━━━━\n`;
           msg += `⚡ _El Diablito Intelligence_\n_(Calculado mediante motor acelerado en caché Redis}_`;

           await sendWhatsApp(phoneId, msg, cfg);
       } catch (err) {
           console.error('❌ Ventas mes error:', err.message);
           await sendWhatsApp(phoneId, `❌ Error: ${err.message}`, cfg);
       }
       return NextResponse.json({ success: true });
    }

    if (textMsg === 'VENTALIVE') {
       const configStr = await redis.get('wapp_config');
       const cfg = typeof configStr === 'string' ? JSON.parse(configStr) : (configStr || {});
       const lToken = await redis.get('loyverse_token');
       
       try {
           const tzDateStr = new Date().toLocaleString('en-US', { timeZone: 'America/Monterrey' });
           const ds = new Date(tzDateStr); ds.setHours(0,0,0,0);
           const de = new Date(tzDateStr); de.setHours(23,59,59,999);
           
           const dbRes = await fetch(`https://global-sales-prediction.vercel.app/api/loyverse/dashboard?start=${ds.toISOString()}&end=${de.toISOString()}`, { 
               headers: { 'Authorization': `Bearer ${lToken}` },
               cache: 'no-store' 
           });
           const dbPayload = await dbRes.json();
           const dbData = dbPayload.data || dbPayload;
           
           if (!dbData.storeKpis) {
               await sendWhatsApp(phoneId, '❌ Sin datos del dashboard o falta sincronización.', cfg);
               return NextResponse.json({ success: true });
           }

           const mtyStr = ds.toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' });
           const horaStr = new Date().toLocaleTimeString('es-MX', { timeZone: 'America/Monterrey', hour: '2-digit', minute: '2-digit', hour12: false });

           let msg = `⚡ *REPORTE OPERATIVO — VENTALIVE*\n📅 ${mtyStr} • ⏰ ${horaStr} hrs\n━━━━━━━━━━━━━━━━━━\n\n`;

           const activeSt = dbData.storeKpis.filter(s => s.ventasBrutas > 0 && !s.name.toLowerCase().includes('prueba')).sort((a,b) => b.totalTickets - a.totalTickets);

           activeSt.forEach((s) => {
               let ltStr = "N/A";
               if (s.lastTicketInfo && s.lastTicketInfo.time) {
                   ltStr = s.lastTicketInfo.time;
               }
               msg += `🏪 *${s.name.trim()}*\n`;
               msg += `   🧾 ${s.totalTickets} tickets emitidos\n`;
               msg += `   ⏱️ ÚT: ${ltStr} hrs\n\n`;
           });

           msg += `━━━━━━━━━━━━━━━━━━\n`;
           msg += `⚡ _El Diablito Intelligence_`;

           await sendWhatsApp(phoneId, msg, cfg);
       } catch (err) {
           console.error('❌ Ventalive error:', err.message);
           await sendWhatsApp(phoneId, `❌ Error: ${err.message}`, cfg);
       }
       return NextResponse.json({ success: true });
    }

    if (textMsg === 'HORA CORTE') {
        const configStr = await redis.get('wapp_config');
        const cfg = typeof configStr === 'string' ? JSON.parse(configStr) : (configStr || {});
        try {
            await fetch(`https://global-sales-prediction.vercel.app/api/whatsapp/cron/inactividad`, {
                headers: { 'Authorization': `Bearer ${process.env.CRON_SECRET || ''}` }
            });
            await sendWhatsApp(phoneId, '✅ Secuencia HORA CORTE (SLA Inactividad) lanzada manualmente.', cfg);
        } catch(e) {
            await sendWhatsApp(phoneId, '❌ Error al forzar SLA: ' + e.message, cfg);
        }
        return NextResponse.json({ success: true });
    }

    // ── 🔄 COMANDO RESET — Borrar TODO sobre el número que lo manda ──
    if (textMsg === 'RESET') {
        const configStr = await redis.get('wapp_config');
        const cfg = typeof configStr === 'string' ? JSON.parse(configStr) : (configStr || {});
        let cleanPhone = '52' + phoneId.replace(/\D/g, '').slice(-10);

        try {
            // 1. Buscar el folio asociado a este teléfono
            const folio = await redis.get(`promo_folio_${cleanPhone}`);

            // 2. Lista de todas las keys a borrar
            const keysToDelete = [
                `chat_hist_${phoneId}`,
                `chat_hist_${cleanPhone}@c.us`,
                `chat_hist_${cleanPhone}`,
                `promo_pos_${cleanPhone}`,
                `promo_folio_${cleanPhone}`,
                `client_store_${cleanPhone}`,
                `coupon_sending_${cleanPhone}`,
                `loyverse_visits_${cleanPhone}`,
                `client_name_${cleanPhone}`,
                `client_points_${cleanPhone}`,
            ];

            // 3. Si tenía folio, borrar todo lo del folio
            if (folio) {
                keysToDelete.push(
                    `folio_owner_${folio}`,
                    `folio_item_name_${folio}`,
                    `folio_valid_date_${folio}`,
                    `folio_status_${folio}`,
                    `folio_item_id_${folio}`,
                    `folio_promo_id_${folio}`
                );
            }

            // 4. Buscar y borrar keys de promos enviadas (promo_sent_{phone}_*)
            // Redis no tiene SCAN directo en ioredis simple, usamos keys conocidas
            // Intentamos borrar patrones comunes de visitas/gasto
            for (let v = 1; v <= 50; v++) {
                keysToDelete.push(`promo_sent_${cleanPhone}_v_${v}`);
            }
            for (const s of [100, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000]) {
                keysToDelete.push(`promo_sent_${cleanPhone}_s_${s}`);
            }

            // 5. Ejecutar borrado masivo
            let deleted = 0;
            for (const key of keysToDelete) {
                const result = await redis.del(key);
                deleted += result;
            }
            // Agregamos un REPELLER de fantasmas (Reset Lock por 5 mins) para bloquear webhooks rezagados de Loyverse
            await redis.setex(`reset_lock_${cleanPhone}`, 15, '1');

            await sendWhatsApp(phoneId, `🔄 *RESET COMPLETO*\n\n✅ Se eliminaron *${deleted}* registros asociados a tu número.\n\n📱 Teléfono: ${cleanPhone}\n${folio ? `🎟️ Folio borrado: ${folio}` : '🎟️ Sin folio previo'}\n\n💡 Ahora puedes empezar de cero. Manda *HOLA* para interactuar.`, cfg);

        } catch (err) {
            console.error('❌ RESET error:', err);
            await sendWhatsApp(phoneId, '❌ Error ejecutando el RESET. Intenta de nuevo.', cfg);
        }
        return NextResponse.json({ success: true });
    }

    // ── 🛡️ BLOQUEAR GRUPOS: Solo los comandos admin de arriba pasan, el resto se ignora
    if (phoneId.includes('@g.us')) {
        return NextResponse.json({ success: true });
    }

    // ── 🎟️ VALIDACIÓN DE CUPÓN (FOLIO) ──────────────────────────────────
    const folioMatch = textMsg.match(FOLIO_EXTRACT) || (FOLIO_REGEX.test(textMsg) ? [textMsg] : null);
    if (folioMatch) {
        const configStr = await redis.get('wapp_config');
        const cfg = typeof configStr === 'string' ? JSON.parse(configStr) : (configStr || {});
        const folio = (folioMatch[1] || folioMatch[0]).toUpperCase();
        // Extraer nombre de sucursal del mensaje (todo después del folio)
        const storeFromMsg = textMsg.replace(FOLIO_EXTRACT, '').trim();
        let cleanPhone = '52' + phoneId.replace(/\D/g, '').slice(-10);

        try {
            const folioOwner = await redis.get(`folio_owner_${folio}`);
            if (!folioOwner) {
                await sendWhatsApp(phoneId, '❌ Este folio no existe.', cfg);
                return NextResponse.json({ success: true });
            }

            const folioStatus = await redis.get(`folio_status_${folio}`);
            if (folioStatus === 'canjeado') {
                await sendWhatsApp(phoneId, '⚠️ Este cupón ya fue canjeado anteriormente.', cfg);
                return NextResponse.json({ success: true });
            }

            const validDateStr = await redis.get(`folio_valid_date_${folio}`);
            if (validDateStr) {
                const nowUTC = new Date();
                const mexicoOffsetMs = -6 * 60 * 60 * 1000;
                const mexicoNow = new Date(nowUTC.getTime() + mexicoOffsetMs);
                const todayStr = mexicoNow.toISOString().split('T')[0];
                const parts = validDateStr.split('|');
                const startDate = parts[0];
                const endDate = parts[1] || parts[0];
                if (todayStr < startDate) {
                    await sendWhatsApp(phoneId, `⏳ Tu cupón aún no es válido. Es válido a partir del *${startDate}*.`, cfg);
                    return NextResponse.json({ success: true });
                }
                if (todayStr > endDate) {
                    await sendWhatsApp(phoneId, `❌ Lo sentimos, tu cupón venció el *${endDate}*.`, cfg);
                    return NextResponse.json({ success: true });
                }
            }

            const promoPos = await redis.get(`promo_pos_${cleanPhone}`);
            if (promoPos === 'canjeado') {
                await sendWhatsApp(phoneId, '⚠️ Ya canjeaste tu promoción anteriormente.', cfg);
                return NextResponse.json({ success: true });
            }

            const loyverseToken = await redis.get('loyverse_token');
            if (!loyverseToken) {
                await sendWhatsApp(phoneId, '❌ Error interno: No se pudo conectar con el punto de venta.', cfg);
                return NextResponse.json({ success: true });
            }

            const clientStore = await redis.get(`client_store_${cleanPhone}`);
            // Prioridad: sucursal del mensaje > sucursal guardada > default
            const storeHint = storeFromMsg || clientStore || 'DIABLITO';
            const storesContext = await getLoyverseStoresContext(storeHint, loyverseToken);

            if (!storesContext) {
                await sendWhatsApp(phoneId, '❌ No se pudo encontrar la sucursal. Intenta de nuevo más tarde.', cfg);
                return NextResponse.json({ success: true });
            }

            const result = await createLoyverseItem(folio, storesContext.targetStore.id, storesContext.allStores, loyverseToken);

            if (result.ok) {
                const itemId = result.data?.id;
                if (itemId) {
                    await redis.set(`folio_item_id_${folio}`, itemId);
                }
                await redis.set(`folio_status_${folio}`, 'activado');
                const itemName = await redis.get(`folio_item_name_${folio}`) || 'Burger Gratis';
                await sendWhatsApp(phoneId, `✅ *¡Cupón activado!*\n\n🎟️ Folio: *${folio}*\n🏆 Premio: *${itemName}*\n🏪 Sucursal: *${storesContext.targetStore.name}*\n\n👉 Muestra este mensaje en caja para canjearlo.\n⏰ El cajero buscará tu folio *${folio}* en la terminal.`, cfg);
            } else {
                console.error('Loyverse item creation failed:', result.data);
                await sendWhatsApp(phoneId, '❌ Hubo un error activando tu cupón. Intenta de nuevo en unos minutos.', cfg);
            }
        } catch (err) {
            console.error('❌ Folio validation error:', err);
            await sendWhatsApp(phoneId, '❌ Error procesando tu cupón. Intenta más tarde.', cfg);
        }
        return NextResponse.json({ success: true });
    }

    // ── 🤖 BOT IA (Gemini) — Respuesta automática a clientes ──────────────
    const configStr = await redis.get('wapp_config');
    const cfg = typeof configStr === 'string' ? JSON.parse(configStr) : (configStr || {});

    if (phoneId.includes('@g.us')) {
        return NextResponse.json({ success: true });
    }

    let cleanPhone = '52' + phoneId.replace(/\D/g, '').slice(-10);

    let historyKey = `chat_hist_${phoneId}`;
    let history = await redis.get(historyKey);
    let parsed = typeof history === 'string' ? JSON.parse(history) : (history || []);
    parsed.push({ role: 'user', parts: [{ text: bodyStr }] });

    if (parsed.length > 40) {
        parsed = parsed.slice(-40);
    }

    // ── 🔍 IDENTIFICACIÓN: Buscar cliente en Loyverse por teléfono ──
    let clientName = null;
    let clientPoints = 0;
    let isRegistered = false;
    const cachedName = await redis.get(`client_name_${cleanPhone}`);
    if (cachedName) {
        clientName = cachedName;
        isRegistered = true;
        const cachedPoints = await redis.get(`client_points_${cleanPhone}`);
        clientPoints = parseInt(cachedPoints || '0');
    } else {
        // No hay cache, buscar en Loyverse
        try {
            const loyToken = await redis.get('loyverse_token');
            if (loyToken) {
                const searchRes = await fetch('https://api.loyverse.com/v1.0/customers?limit=250', {
                    headers: { Authorization: `Bearer ${loyToken}` }
                });
                if (searchRes.ok) {
                    const searchData = await searchRes.json();
                    const clientPhone10 = cleanPhone.slice(-10);
                    const match = (searchData.customers || []).find(c => {
                        if (!c.phone_number) return false;
                        return c.phone_number.replace(/\D/g, '').slice(-10) === clientPhone10;
                    });
                    if (match) {
                        clientName = match.name;
                        clientPoints = match.total_points || 0;
                        isRegistered = true;
                        // Cachear en Redis para no buscar cada vez
                        await redis.set(`client_name_${cleanPhone}`, clientName);
                        await redis.set(`client_points_${cleanPhone}`, String(clientPoints));
                        await redis.set(`client_registered_${cleanPhone}`, '1');
                    }
                }
            }
        } catch(lookupErr) { console.error('[Bot] Loyverse lookup error:', lookupErr); }
    }

    // ── 💬 PRIMER CONTACTO: 2 burbujas separadas ──
    if (parsed.length === 1) {
        if (isRegistered && clientName) {
            // Cliente ya registrado: saludar por nombre
            await sendWhatsApp(phoneId, `¡Hola *${clientName}*! 👋🍔`, cfg);
            await new Promise(r => setTimeout(r, 800));
            await sendWhatsApp(phoneId, `Qué gusto verte de vuelta en *El Diablito* 🌶️\n\n¿En qué te ayudo?\n1️⃣ Revisar tus puntos 🎁 (tienes *${clientPoints}*)\n2️⃣ Editar tus datos 📝`, cfg);
            parsed.push({ role: 'model', parts: [{ text: `¡Hola ${clientName}! Qué gusto verte de vuelta. ¿En qué te ayudo? 1) Puntos 2) Editar datos` }] });
            await redis.set(historyKey, JSON.stringify(parsed));
            await redis.set(`chat_hist_${cleanPhone}@c.us`, JSON.stringify(parsed));
            await redis.set(`chat_hist_${cleanPhone}`, JSON.stringify(parsed));
            return NextResponse.json({ success: true });
        } else {
            // Cliente nuevo: invitar a registrarse
            await sendWhatsApp(phoneId, '¡Hola! 👋🍔 Bienvenido a *El Diablito Boneless & Burgers*', cfg);
            await new Promise(r => setTimeout(r, 800));
            await sendWhatsApp(phoneId, 'Regístrate y recibe una *🍔 BURGER GRATIS* 🎁\n\nSolo necesito tu *nombre* y *dirección* (calle, número, colonia, municipio).', cfg);
            parsed.push({ role: 'model', parts: [{ text: 'Hola! Bienvenido al Diablito. Regístrate y recibe una burger gratis. Solo necesito tu nombre y dirección.' }] });
            await redis.set(historyKey, JSON.stringify(parsed));
            await redis.set(`chat_hist_${cleanPhone}@c.us`, JSON.stringify(parsed));
            await redis.set(`chat_hist_${cleanPhone}`, JSON.stringify(parsed));
            return NextResponse.json({ success: true });
        }
    }

    try {
        const botPrompt = await redis.get('bot_prompt') || '';
        const aiToken = cfg.aiToken;

        if (!botPrompt || !aiToken) {
            await redis.set(historyKey, JSON.stringify(parsed));
            await redis.set(`chat_hist_${cleanPhone}@c.us`, JSON.stringify(parsed));
            await redis.set(`chat_hist_${cleanPhone}`, JSON.stringify(parsed));
            return NextResponse.json({ success: true });
        }

        // Construir historial en formato Gemini
        const geminiContents = [];

        const clientPhone10 = cleanPhone.slice(-10);
        let systemContext = botPrompt + '\n\n# REGLAS DE FORMATO Y ESTILO OBLIGATORIAS:\n1. NUNCA respondas con texto plano o aburrido.\n2. Usa abundantes emojis relacionados a comida (🍔, 🍟, 🌶️, 🔥, 🎁, 🎉).\n3. Usa saltos de línea constantes para que el texto respire y no sea un bloque enorme.\n4. Usa *negritas* para resaltar las palabras clave (como *Gratis*, *Descuentos*, *Nombre*, *Dirección*).\n5. Usa listas con viñetas reales (• o 🟢 o ➡️) si tienes que enumerar cosas.\nTu tono es enérgico, relajado, súper amigable y antojadizo.\n\n# CONTEXTO AUTOMÁTICO\n';
        
        if (isRegistered) {
            systemContext += `El cliente YA ESTÁ REGISTRADO. Se llama ${clientName || 'Cliente'} y actualmente tiene ${clientPoints} PUNTOS acumulados.
Su número es: ${clientPhone10}. (No pidas su número).
NUNCA le ofrezcas registrarse de nuevo ni le ofrezcas el Cupón de Bienvenida (ya lo usó).

INTERACCIÓN FRECUENTE (MENÚ PRINCIPAL):
1) Revisar Puntos: Si el cliente selecciona la opción 1 o pregunta por sus puntos, confírmale amablemente que tiene exactamente "${clientPoints} puntos" e infórmale que puede canjearlos como dinero o descuentos al comprar en sucursal.
2) Editar Datos: Si el cliente selecciona la opción 2 o pide cambiar su domicilio, pregúntale cuál será su nueva dirección y su nombre, y actualízalo usando la etiqueta secreta de actualización.

# REGLA PARA ACTUALIZAR DATOS:
Cuando el cliente te haya dado nuevos datos (nombre y nueva dirección) para actualizar su perfil, DEBES confirmar el cambio añadiendo exactamente esta línea invisible al final de tu mensaje:
[REGISTRO_OK:nombre_nuevo|nueva_dirección|ciudad]
Ejemplo: "¡Listo, he actualizado tu domicilio! [REGISTRO_OK:Oscar|Bosques 102|Monterrey]"`;
        } else {
            systemContext += `El cliente es NUEVO, no está registrado en la base de datos.
Su número es: ${clientPhone10}. (No le pidas su número, ya lo tienes).
Tu objetivo principal es invitarlo a registrarse cordialmente para que reciba el Cupón de Bienvenida (Hamburguesa Gratis).

# REGLA DE REGISTRO CRÍTICA:
Para registrarlo, necesitas que te diga su Nombre y su Dirección (calle, número, colonia, etc).
Solo cuando te haya dado su nombre y dirección, confírmale el registro y AÑADE AL FINAL de tu respuesta exactamente esta línea invisible:
[REGISTRO_OK:nombre|dirección|ciudad]
Ejemplo: "¡Perfecto, ya te he registrado! [REGISTRO_OK:Oscar R|Cirros 102 Col Las Nubes|Santa Catarina]"`;
        }

        // System instruction va aparte en Gemini, pero lo metemos como primer user+model exchange
        geminiContents.push({ role: 'user', parts: [{ text: 'Instrucciones del sistema: ' + systemContext }] });
        geminiContents.push({ role: 'model', parts: [{ text: 'Entendido, seguiré estas instrucciones al pie de la letra. Ya tengo el número del cliente.' }] });

        for (const entry of parsed) {
            const role = entry.role === 'user' ? 'user' : 'model';
            const text = entry.parts?.[0]?.text || '';
            if (text) geminiContents.push({ role, parts: [{ text }] });
        }

        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${aiToken}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: geminiContents,
                generationConfig: {
                    maxOutputTokens: 500,
                    temperature: 0.7
                }
            })
        });

        if (geminiRes.ok) {
            const geminiData = await geminiRes.json();
            const reply = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

            if (reply) {
                // Limpiar tag antes de enviar al usuario
                const cleanReply = reply.replace(/\[REGISTRO_OK:[^\]]*\]/g, '').trim();
                parsed.push({ role: 'model', parts: [{ text: cleanReply }] });
                await redis.set(historyKey, JSON.stringify(parsed));
                await redis.set(`chat_hist_${cleanPhone}@c.us`, JSON.stringify(parsed));
                await redis.set(`chat_hist_${cleanPhone}`, JSON.stringify(parsed));
                await sendWhatsApp(phoneId, cleanReply, cfg);

                // ── 📋 AUTO-REGISTRO: Detectar tag [REGISTRO_OK] en la respuesta del bot ──
                const alreadyRegistered = await redis.get(`client_registered_${cleanPhone}`);
                const regMatch = reply.match(/\[REGISTRO_OK:([^|]+)\|([^|]+)\|([^\]]+)\]/);
                if (!alreadyRegistered && regMatch) {
                    try {
                                    const clientData = { name: regMatch[1].trim(), address: regMatch[2].trim(), city: regMatch[3].trim() };
                                    if (clientData.name) {
                                        const loyverseToken = await redis.get('loyverse_token');
                                        if (loyverseToken) {
                                            // ── 🛡️ ANTI-DUPLICADO: Buscar si ya existe un cliente con este teléfono ──
                                            let existingCustomerId = null;
                                            try {
                                                const searchRes = await fetch('https://api.loyverse.com/v1.0/customers?limit=250', {
                                                    headers: { Authorization: `Bearer ${loyverseToken}` }
                                                });
                                                if (searchRes.ok) {
                                                    const searchData = await searchRes.json();
                                                    const match = (searchData.customers || []).find(c => {
                                                        if (!c.phone_number) return false;
                                                        return c.phone_number.replace(/\D/g, '').slice(-10) === clientPhone10;
                                                    });
                                                    if (match) existingCustomerId = match.id;
                                                }
                                            } catch(srchErr) { console.error('[Bot] Error buscando duplicado:', srchErr); }

                                            if (existingCustomerId) {
                                                // Ya existe: solo actualizar datos faltantes (nombre, dirección)
                                                const updatePayload = {
                                                    id: existingCustomerId,
                                                    name: clientData.name,
                                                };
                                                if (clientData.address) updatePayload.address = clientData.address;
                                                if (clientData.city) updatePayload.city = clientData.city;
                                                try {
                                                    await fetch('https://api.loyverse.com/v1.0/customers', {
                                                        method: 'POST',
                                                        headers: { Authorization: `Bearer ${loyverseToken}`, 'Content-Type': 'application/json' },
                                                        body: JSON.stringify(updatePayload)
                                                    });
                                                } catch(e) {}
                                                await redis.set(`client_registered_${cleanPhone}`, '1');
                                                console.log(`[Bot] Cliente YA EXISTÍA, actualizado: ${clientData.name} (${clientPhone10})`);
                                            } else {
                                                // No existe: crear nuevo
                                                const customerPayload = {
                                                    name: clientData.name,
                                                    phone_number: clientPhone10,
                                                    address: clientData.address || '',
                                                    city: clientData.city || '',
                                                    note: 'Tienda: WhatsApp\nRegistrado via WhatsApp Bot'
                                                };
                                                const createRes = await fetch('https://api.loyverse.com/v1.0/customers', {
                                                    method: 'POST',
                                                    headers: { Authorization: `Bearer ${loyverseToken}`, 'Content-Type': 'application/json' },
                                                    body: JSON.stringify(customerPayload)
                                                });
                                                if (createRes.ok) {
                                                    await redis.set(`client_registered_${cleanPhone}`, '1');
                                                    await redis.set(`client_store_${cleanPhone}`, 'WhatsApp');
                                                    console.log(`[Bot] Cliente NUEVO registrado en Loyverse: ${clientData.name} (${clientPhone10})`);
                                                    
                                                    // ── 🎟️ CUPÓN DE BIENVENIDA ──
                                                    try {
                                                        const existingPromo = await redis.get(`promo_pos_${cleanPhone}`);
                                                        if (!existingPromo) {
                                                            const promosInfo = await redis.get('promotions');
                                                            const promos = promosInfo ? (typeof promosInfo === 'string' ? JSON.parse(promosInfo) : promosInfo) : [];
                                                            const welcomePromo = promos.find(p => p.isWelcomePromo);
                                                            if (welcomePromo) {
                                                                const mutexKey = `coupon_sending_${cleanPhone}`;
                                                                const acquired = await redis.setnx(mutexKey, '1');
                                                                if (acquired) {
                                                                    await redis.expire(mutexKey, 30);
                                                                    const folioW = generateFolio();
                                                                    const { text: promoTextRaw, validDate } = buildPromoText(welcomePromo.text, folioW, welcomePromo.validFrom, welcomePromo.validityDuration);
                                                                    const promoText = promoTextRaw.replace(/{nombre_de_cliente}/g, clientData.name || '');
                                                                    
                                                                    await redis.set(`promo_folio_${cleanPhone}`, folioW);
                                                                    await redis.set(`folio_owner_${folioW}`, cleanPhone);
                                                                    await redis.set(`folio_valid_date_${folioW}`, validDate);
                                                                    await redis.set(`folio_item_name_${folioW}`, welcomePromo.itemName || 'Burger Gratis');
                                                                    if (welcomePromo.id) {
                                                                        await redis.set(`folio_promo_id_${folioW}`, welcomePromo.id);
                                                                        await redis.incr(`promo_sent_count_${welcomePromo.id}`);
                                                                    }
                                                                    
                                                                    let endpoint = '/messages/chat';
                                                                    let wBody = { token: cfg.wappToken, to: cleanPhone + '@c.us', body: promoText };
                                                                    
                                                                    if (welcomePromo.image) {
                                                                        endpoint = '/messages/image';
                                                                        wBody = { token: cfg.wappToken, to: cleanPhone + '@c.us', image: `https://global-sales-prediction.vercel.app/api/promotions/image?ts=${Date.now()}`, caption: promoText };
                                                                    }
                                                                    
                                                                    const gwRes = await fetch(`https://gatewaywapp-production.up.railway.app/${cfg.wappInstance}${endpoint}`, {
                                                                        method: 'POST',
                                                                        headers: { 'Content-Type': 'application/json' },
                                                                        body: JSON.stringify(wBody)
                                                                    });
                                                                    
                                                                    if (gwRes.ok) {
                                                                        await redis.set(`promo_pos_${cleanPhone}`, 'naranja');
                                                                        console.log(`[Bot] Cupón de bienvenida enviado a ${cleanPhone}`);
                                                                    }
                                                                    await redis.del(mutexKey);
                                                                }
                                                            }
                                                        }
                                                    } catch(cupErr) { console.error('[Bot] Error enviando cupón bienvenida:', cupErr); }
                                                } else {
                                                    console.error('[Bot] Error creando cliente en Loyverse:', await createRes.text());
                                                }
                                            }
                                        }
                                    }
                    } catch(regErr) { console.error('[Bot] Error en auto-registro:', regErr); }
                }
                
                // Limpiar el tag del mensaje antes de que se guarde en el historial visual
                if (regMatch) {
                    const cleanReply = reply.replace(/\[REGISTRO_OK:[^\]]+\]/, '').trim();
                    // Actualizar el último entry del historial sin el tag
                    parsed[parsed.length - 1] = { role: 'model', parts: [{ text: cleanReply }] };
                    await redis.set(historyKey, JSON.stringify(parsed));
                    await redis.set(`chat_hist_${cleanPhone}@c.us`, JSON.stringify(parsed));
                    await redis.set(`chat_hist_${cleanPhone}`, JSON.stringify(parsed));
                }
            }
        } else {
            console.error('Gemini API Error:', await geminiRes.text());
        }
    } catch (botErr) {
        console.error('❌ Bot IA Error:', botErr);
    }

    await redis.set(historyKey, JSON.stringify(parsed));
    await redis.set(`chat_hist_${cleanPhone}@c.us`, JSON.stringify(parsed));
    await redis.set(`chat_hist_${cleanPhone}`, JSON.stringify(parsed));

    return NextResponse.json({ success: true });
  } catch(e) { console.error(e); return NextResponse.json({ success:true }); }
}
