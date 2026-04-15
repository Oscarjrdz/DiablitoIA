import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

const FOLIO_REGEX = /^[A-Z][0-9]{4}$/i;

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
    
    const textMsg = bodyStr.trim().toUpperCase();
    let phoneId = payload.data.from || payload.data.key?.remoteJid || payload.data.__raw?.key?.remoteJidAlt || payload.data.__raw?.key?.remoteJid;
    
    if (phoneId && phoneId.includes('@s.whatsapp.net')) {
      phoneId = phoneId.replace('@s.whatsapp.net', '@c.us');
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
               let url = `https://api.loyverse.com/v1.0/receipts?created_at_min=${fetchStart}&created_at_max=${fetchEnd}&limit=250`;
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
        try {
            await fetch(`https://global-sales-prediction.vercel.app/api/whatsapp/cron/sla`, {
                headers: { 'Authorization': `Bearer ${process.env.CRON_SECRET || ''}` }
            });
            await sendWhatsApp(phoneId, '✅ Secuencia HORA CORTE (SLA Inactividad) lanzada manualmente.', cfg || {});
        } catch(e) {
            await sendWhatsApp(phoneId, '❌ Error al forzar SLA: ' + e.message, cfg || {});
        }
        return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: true });
}
