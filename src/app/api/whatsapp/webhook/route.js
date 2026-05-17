import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { generateFolio, buildPromoText } from '@/lib/folio';

const FOLIO_REGEX = /^[A-Z]\d{3,4}$/i;
const FOLIO_EXTRACT = /([A-Z]\d{3,4})/i;

// ── 🏪 MAPA DE SUCURSALES (fuente única de verdad) ──
const STORE_MAP = { '1': 'Bosques', '2': 'Valle de Lincoln', '3': 'San Blas', '4': 'Titanio', '5': 'Palmas', '6': 'Cordillera' };
function buildStoreMenu(folio) {
    const lines = Object.entries(STORE_MAP).map(([n, name]) => `${n}️⃣ - ${name}`);
    return `📸 ¡Folio *${folio}* detectado en la imagen!\nPara activarlo, por favor selecciona en qué sucursal te encuentras respondiendo con el *número*:\n\n${lines.join('\n')}\n\n*(O responde ❌ CANCELAR si detecté mal el folio)*`;
}

async function getLoyverseStoresContext(storeHint, token) {
  try {
    const res = await fetch('https://api.loyverse.com/v1.0/stores', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return null;
    const data = await res.json();
    const hint = storeHint.toUpperCase();
    const allStores = data.stores || [];
    const targetStore = allStores.find(s => {
      const dbName = s.name.toUpperCase();
      if (dbName.includes(hint)) return true;
      if (hint.includes('VALLE DE LINCOLN') && dbName.includes('GARCIA')) return true;
      return false;
    });
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
  try {
    const res = await fetch(`https://gatewaywapp-production.up.railway.app/${cfg.wappInstance}/messages/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: cfg.wappToken, to, body })
    });
    if (res.ok) {
      const data = await res.json();
      const rawId = data?.messageId || data?.key?.id || data?.data?.key?.id || data?.id;
      return typeof rawId === 'object' ? (rawId?._serialized || null) : (rawId || null);
    }
  } catch {}
  return null;
}

async function trackMsgId(msgId, cleanPhone) {
  if (!msgId || !cleanPhone) return;
  await redis.setex(`chat_msg_${msgId}`, 604800, cleanPhone);
}

export async function POST(req) {
  try {
    
    const payload = await req.json();
    // Debug point: Save last payload in Redis
    await redis.set('DEBUG_LAST_PAYLOAD', payload);


    // ── Typing / Presence ──
    if (payload.event_type === 'presence_update' || payload.event_type === 'chat_state' || payload.event_type === 'typing') {
      const fromJid = payload.data?.from || payload.data?.id || payload.data?.chatId || '';
      if (fromJid && !fromJid.includes('@g.us')) {
        const tPhone = '52' + fromJid.replace(/\D/g, '').slice(-10);
        const isTyping = payload.data?.presence === 'composing'
          || payload.data?.state === 'composing'
          || payload.data?.type === 'composing'
          || payload.data?.typing === true;
        if (isTyping) {
          await redis.setex(`typing_${tPhone}`, 8, '1');
        } else {
          await redis.del(`typing_${tPhone}`);
        }
      }
      return NextResponse.json({ success: true });
    }

    // ── ACK → palomitas y semáforo de promo ──
    const ACK_EVENTS = ['message_ack', 'messages.update', 'ack', 'message.ack', 'msg_ack'];
    if (ACK_EVENTS.includes(payload.event_type)) {
      // Guardar en debug log (últimos 30)
      await redis.lpush('debug_ack_log', JSON.stringify({ ts: Date.now(), event_type: payload.event_type, data: payload.data }));
      await redis.ltrim('debug_ack_log', 0, 29);

      const msgData = payload.data || {};
      const dataArr = Array.isArray(msgData) ? msgData : [msgData];

      for (const item of dataArr) {
        // ── Extraer msgId (múltiples formatos de gateway) ──
        const rawId = item?.key?.id || item?.id?._serialized || item?.id || item?.msgId || null;
        const msgId = typeof rawId === 'object' ? (rawId?._serialized || null) : rawId;

        // ── Extraer statusId (múltiples formatos, normalizar a minúsculas) ──
        const rawStatus = item?.update?.status ?? item?.ack ?? item?.status ?? null;
        const statusId = typeof rawStatus === 'string' ? rawStatus.toLowerCase() : rawStatus;

        if (!msgId || statusId === null) continue;

        const STATUS_ORDER = { sent: 1, delivered: 2, read: 3 };
        let newStatus = null;
        if ([0, 1, 2, 'server_ack', 'pending', 'sent'].includes(statusId)) newStatus = 'sent';
        if ([3, 'delivery_ack', 'delivered'].includes(statusId)) newStatus = 'delivered';
        if ([4, 5, 'read', 'read_ack', 'played'].includes(statusId)) newStatus = 'read';

        // ── Actualizar historial ──
        if (newStatus) {
          const chatPhone = await redis.get(`chat_msg_${msgId}`);
          if (chatPhone) {
            const hKey = `chat_hist_${chatPhone}@c.us`;
            try {
              const hData = await redis.get(hKey);
              if (hData) {
                const hist = typeof hData === 'string' ? JSON.parse(hData) : hData;
                for (let i = hist.length - 1; i >= 0; i--) {
                  const p = hist[i].parts?.[0];
                  if (p?.msgId === msgId) {
                    if ((STATUS_ORDER[newStatus] || 0) > (STATUS_ORDER[p.status] || 0)) {
                      p.status = newStatus;
                    }
                    break;
                  }
                }
                await redis.set(hKey, JSON.stringify(hist));
                await redis.set(`chat_hist_${chatPhone}`, JSON.stringify(hist));
              }
            } catch {}
          }
        }

        // Semáforo de promo
        if ([3, 4, 5, 'READ', 'PLAYED'].includes(statusId)) {
          const phone = await redis.get(`promo_msg_${msgId}`);
          if (phone) await redis.set(`promo_pos_${phone}`, 'verde');
        }
      }
      return NextResponse.json({ success: true });
    }

    if (payload.event_type !== 'message_received' || (!payload.data?.from && !payload.data?.key)) {
      return NextResponse.json({ success: true });
    }

    const fromMe = payload.data.fromMe !== undefined ? payload.data.fromMe : payload.data.key?.fromMe;
    
    // We will no longer block fromMe messages globally because we want to capture outgoing messages in groups
    // If it's not a group, and it's fromMe, we can block it.
    let isGroupMsgGeneral = false;
    let tempPhoneId = payload.data.from || payload.data.key?.remoteJid || payload.data.__raw?.key?.remoteJidAlt || payload.data.__raw?.key?.remoteJid;
    if (tempPhoneId && tempPhoneId.includes('@g.us')) isGroupMsgGeneral = true;

    if (fromMe && !isGroupMsgGeneral) return NextResponse.json({ success: true });

    // ── 🛒 INTERCEPCIÓN DE PEDIDOS DEL CATÁLOGO (CARRITO) ──
    if (payload.data.type === 'order' || payload.data.__raw?.message?.orderMessage) {
      const pedidoRaw = payload.data.__raw?.message?.orderMessage;
      
      if (pedidoRaw) {
          // Extraer amount asegurando que si es un objeto {low, high} use low
          let rawAmount = typeof pedidoRaw.totalAmount1000 === 'object' ? pedidoRaw.totalAmount1000.low : pedidoRaw.totalAmount1000;
          const total = (Number(rawAmount) / 1000).toFixed(2);
          
          const itemCount = pedidoRaw.itemCount || 0;
          const currency = pedidoRaw.totalCurrencyCode || 'MXN';
          const nota = pedidoRaw.message || '';
          const orderId = pedidoRaw.orderId || '';
          const orderToken = pedidoRaw.token || '';

          const pushName = payload.data.pushName || 'Cliente';
          let fromJid = payload.data.from || '';
          if (fromJid.includes('@s.whatsapp.net')) fromJid = fromJid.replace('@s.whatsapp.net', '@c.us');

          const configStr = await redis.get('wapp_config');
          const cfg = typeof configStr === 'string' ? JSON.parse(configStr) : (configStr || {});

          // Intentar obtener los detalles de cada producto del Gateway
          let productLines = '';
          let productLinesBubble = '';
          try {
              if (orderId && orderToken && cfg.wappInstance && cfg.wappToken) {
                  const detailRes = await fetch(
                      `https://gatewaywapp-production.up.railway.app/${cfg.wappInstance}/order/${orderId}?token=${cfg.wappToken}&orderToken=${encodeURIComponent(orderToken)}`,
                      { signal: AbortSignal.timeout(8000) }
                  );
                  if (detailRes.ok) {
                      const detailData = await detailRes.json();
                      const products = detailData.order?.products || [];
                      if (products.length > 0) {
                          products.forEach((p, i) => {
                              const pPrice = (p.price / 1000).toFixed(2);
                              productLines += `   ${i + 1}. ${p.name} x${p.quantity} — $${pPrice} ${p.currency || currency}\n`;
                              productLinesBubble += `• ${p.name} x${p.quantity} — $${pPrice}\n`;
                          });
                      }
                  }
              }
          } catch (detailErr) {
              console.error('[Order] Error fetching details:', detailErr.message);
          }

          console.log('🛒 NUEVO PEDIDO DEL CATÁLOGO');
          console.log('Cliente:', pushName, fromJid);
          console.log('Productos:', itemCount);
          console.log('Total: $' + total, currency);

          // Responder al cliente
          let msgCliente = `🍔 ¡Hola ${pushName}! Hemos recibido tu pedido:\n\n`;
          if (productLinesBubble) {
              msgCliente += `${productLinesBubble}\n`;
          }
          msgCliente += `💰 *Total: $${total} ${currency}*\n\n`;
          msgCliente += `En un momento un agente se comunicará contigo para confirmar los detalles. ¡Gracias por tu preferencia! 🚀`;
          await sendWhatsApp(fromJid, msgCliente, cfg);
          
          // 3. Guardar en el historial para que aparezca en el Dashboard UI
          let cleanPhone = '52' + fromJid.replace(/\D/g, '').slice(-10);
          let historyKey = `chat_hist_${cleanPhone}@c.us`;
          let historyStr = await redis.get(historyKey) || await redis.get(`chat_hist_${fromJid}`);
          let history = typeof historyStr === 'string' ? JSON.parse(historyStr) : (historyStr || []);
          
          let bubbleText = `🛒 *Pedido Recibido*\n`;
          if (productLinesBubble) {
              bubbleText += `\n${productLinesBubble}`;
          }
          bubbleText += `\n💰 Total: $${total} ${currency}`;
          if (nota) bubbleText += `\n📝 Nota: ${nota}`;

          history.push({
              role: 'user',
              parts: [{
                  text: bubbleText,
                  msgId: payload.data.id || Date.now().toString(),
                  ts: payload.data.timestamp ? payload.data.timestamp * 1000 : Date.now(),
                  status: 'delivered'
              }]
          });
          
          history.push({
              role: 'model',
              parts: [{
                  text: msgCliente,
                  ts: Date.now()
              }]
          });

          await redis.set(historyKey, JSON.stringify(history));
          await redis.set(`chat_hist_${cleanPhone}`, JSON.stringify(history));
      }
      return NextResponse.json({ success: true, note: 'order_processed_and_saved' });
    }

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

    // ── 📸 MANEJO DE IMÁGENES PARA EXTRAER FOLIO (Omitir en grupos) ──
    const isGroupMsg = (phoneId && phoneId.includes('@g.us')) || 
                       (payload.data.__raw?.key?.remoteJid && payload.data.__raw.key.remoteJid.includes('@g.us')) ||
                       (payload.data.key?.remoteJid && payload.data.key.remoteJid.includes('@g.us'));

    const isImage = (payload.data.type === 'image' || !!payload.data.__raw?.message?.imageMessage) && !isGroupMsg;
    // Loguear intento
    if (isImage) {
        await redis.lpush('debug_image_logs', JSON.stringify({ step: 'START', ts: Date.now(), mediaType: typeof payload.data.media, mediaVal: payload.data.media ? payload.data.media.substring(0,50) : null }));
        await redis.ltrim('debug_image_logs', 0, 99);
    }

    if (isImage && payload.data.media) {
       try {
           const imgRes = await fetch(payload.data.media);
           await redis.lpush('debug_image_logs', JSON.stringify({ step: 'FETCH_MEDIA', ok: imgRes.ok, status: imgRes.status }));
           if (imgRes.ok) {
               const mimeType = imgRes.headers.get('content-type') || 'image/jpeg';
               const arrayBuffer = await imgRes.arrayBuffer();
               const base64Image = Buffer.from(arrayBuffer).toString('base64');
               const configStr = await redis.get('wapp_config');
               const cfg = typeof configStr === 'string' ? JSON.parse(configStr) : (configStr || {});
               const aiToken = cfg.aiToken;
               if (aiToken) {
                   await redis.lpush('debug_image_logs', JSON.stringify({ step: 'CALL_GEMINI', len: base64Image.length }));
                   const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${aiToken}`, {
                       method: 'POST',
                       headers: { 'Content-Type': 'application/json' },
                       body: JSON.stringify({
                           contents: [{
                               parts: [
                                    { text: "Busca un código de 1 letra y 3 o 4 números (ej F666, A1234, X9876). Responde SOLO con el código exacto, o NO_FOLIO si no encuentras ninguno." },
                                    { inlineData: { mimeType: mimeType, data: base64Image } }
                                ]
                           }],
                           generationConfig: { maxOutputTokens: 256, temperature: 0, thinkingConfig: { thinkingBudget: 0 } }
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
                           await redis.expire(`pending_folio_store_${cleanPhoneGlobal}`, 600);
                           await sendWhatsApp(phoneId, buildStoreMenu(extractedFolio), cfg);
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
       // FIX#5: Si no es folio, informar al usuario en vez de silencio
       try {
           const cfgFb = await redis.get('wapp_config');
           const cfgFallback = typeof cfgFb === 'string' ? JSON.parse(cfgFb) : (cfgFb || {});
           await sendWhatsApp(phoneId, '📸 Recibí tu imagen pero no encontré un código de cupón.\n\nSi tienes un cupón, asegúrate de que el folio (ej. *F666*) sea visible en la foto. 😊', cfgFallback);
       } catch(e) {}
       return NextResponse.json({ success: true });
    }

     // ── 🛡️ GUARDIA: Imagen sin media pero caption con folio → forzar menú de sucursal ──
     // Si es imagen (con o sin media), y el caption/body contiene un folio,
     // NO dejar que caiga al activador directo. Forzar el flujo de selección de sucursal.
     if (isImage && textMsg) {
         const captionFolioMatch = textMsg.match(FOLIO_EXTRACT) || (FOLIO_REGEX.test(textMsg) ? [textMsg] : null);
         if (captionFolioMatch) {
             const captionFolio = (captionFolioMatch[1] || captionFolioMatch[0]).toUpperCase();
             const alreadyPending = await redis.get(`pending_folio_store_${cleanPhoneGlobal}`);
             if (!alreadyPending) {
                 // Solo si el flujo de imagen no lo guardó ya (evita duplicado)
                 const configStr = await redis.get('wapp_config');
                 const cfg = typeof configStr === 'string' ? JSON.parse(configStr) : (configStr || {});
                 await redis.set(`pending_folio_store_${cleanPhoneGlobal}`, captionFolio);
                 await redis.expire(`pending_folio_store_${cleanPhoneGlobal}`, 600);
                 await sendWhatsApp(phoneId, buildStoreMenu(captionFolio), cfg);
             }
             return NextResponse.json({ success: true, note: 'image_caption_folio_intercepted' });
         }
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
        
        const selNum = textMsg.replace(/\D/g, ''); // FIX#4: Usa STORE_MAP global
        const selectedStore = STORE_MAP[textMsg] || STORE_MAP[selNum];
        
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
        let phone10 = cleanPhone.slice(-10);

        try {
            // 1. Buscar el folio asociado a este teléfono
            const folio = await redis.get(`promo_folio_${cleanPhone}`);

            // 2. Traer todas las keys dinámicamente con el wildcard
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

            // 2b. Añadir manual list to ensure everything gets deleted even if keys() fails
            const manualKeys = [
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
                `client_registered_${cleanPhone}`,
                `pending_folio_store_${cleanPhone}`
            ];
            
            if (folio) {
                manualKeys.push(
                    `folio_owner_${folio}`,
                    `folio_item_name_${folio}`,
                    `folio_valid_date_${folio}`,
                    `folio_status_${folio}`,
                    `folio_item_id_${folio}`,
                    `folio_promo_id_${folio}`
                );
            }
            
            for (let v = 1; v <= 50; v++) { manualKeys.push(`promo_sent_${cleanPhone}_v_${v}`); }
            for (const s of [100, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000]) { manualKeys.push(`promo_sent_${cleanPhone}_s_${s}`); }

            // Deduplicar keys
            keysToDelete = [...new Set([...keysToDelete, ...manualKeys])];

            // 5. Ejecutar borrado masivo
            let deleted = 0;
            for (const key of keysToDelete) {
                if (key.includes('reset_lock_')) continue; // Don't delete any active reset lock
                const result = await redis.del(key);
                deleted += result ? 1 : 0;
            }
            // Agregamos un REPELLER de fantasmas (Reset Lock por 5 mins) para bloquear webhooks rezagados de Loyverse
            await redis.setex(`reset_lock_${cleanPhone}`, 15, '1');

            // 6. Eliminar profundamente de Loyverse API
            const loyverseToken = await redis.get('loyverse_token');
            if (loyverseToken) {
                try {
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
                            return cand.endsWith(phone10);
                        });
                        
                        for (const match of matches) {
                            await fetch(`https://api.loyverse.com/v1.0/customers/${match.id}`, {
                                method: 'DELETE',
                                headers: { Authorization: `Bearer ${loyverseToken}` }
                            });
                        }
                        cursor = searchData.cursor || null;
                        keepSearching = !!cursor;
                    }
                } catch (e) {
                    console.error('Reset delete customer error in webhook:', e);
                }
            }

            await sendWhatsApp(phoneId, `🔄 *RESET TOTAL COMPLETADO*\n\n✅ Se ha eliminado tu cuenta y tu historial completo de la base de datos local y Loyverse.\n\n⚙️ Archivos del sistema borrados: ${deleted}\n📱 Teléfono: ${cleanPhone}\n\n💡 Hemos olvidado todo. Manda *HOLA* para volver a empezar.`, cfg);

        } catch (err) {
            console.error('❌ RESET error:', err);
            await sendWhatsApp(phoneId, '❌ Error ejecutando el RESET. Intenta de nuevo.', cfg);
        }
        return NextResponse.json({ success: true });
    }

    // ── 🛡️ BLOQUEAR GRUPOS DE LA IA (pero guardar su historial)
    if (phoneId.includes('@g.us')) {
        let cleanGroupPhone = '52' + phoneId.replace(/\D/g, '').slice(-10);
        let groupHistKey = `chat_hist_${cleanGroupPhone}@c.us`;
        let gHistory = await redis.get(groupHistKey) || await redis.get(`chat_hist_${phoneId}`);
        let gParsed = typeof gHistory === 'string' ? JSON.parse(gHistory) : (gHistory || []);
        
        let senderName = payload.data.pushName || 'Miembro';
        
        // El Gateway puede mandar el número en varios campos dependiendo de si es Evolution, Baileys o un wrapper custom
        let memberJid = payload.data.participant 
                     || payload.data.key?.participant 
                     || payload.data.__raw?.key?.participant 
                     || payload.data.sender 
                     || payload.data.author
                     || '';
                     
        if (memberJid) {
           senderName += ` (${memberJid.split('@')[0]})`;
        }

        // TEMP DEBUG: Guardar payload para poder inspeccionarlo
        await redis.lpush('debug_group_payload', JSON.stringify({
           from: payload.data.from,
           pushName: payload.data.pushName,
           participant: payload.data.participant,
           keyPart: payload.data.key?.participant,
           sender: payload.data.sender,
           author: payload.data.author,
           rawKeys: payload.data.__raw ? Object.keys(payload.data.__raw) : null
        }));
        await redis.ltrim('debug_group_payload', 0, 10);

        // Prevent duplicates for outgoing messages sent from the Web UI
        let isImageActual = payload.data.type === 'image' || !!payload.data.__raw?.message?.imageMessage;
        let finalBody = bodyStr;
        if (isImageActual) finalBody = '[Imagen] ' + finalBody;

        const fromMe = payload.data.fromMe !== undefined ? payload.data.fromMe : payload.data.key?.fromMe;
        const msgId = payload.data.id || payload.data.key?.id;
        
        if (fromMe) {
            if (msgId) {
                const isFromWebUI = await redis.get(`chat_msg_${msgId}`);
                if (isFromWebUI) return NextResponse.json({ success: true, note: 'duplicate_from_web_ui_group' });
            }
            gParsed.push({ role: 'model', parts: [{ text: finalBody, ts: Date.now() }] });
        } else {
            gParsed.push({ role: 'user', parts: [{ text: `${senderName}: ${finalBody}`, ts: Date.now() }] });
        }
        
        if (gParsed.length > 40) gParsed = gParsed.slice(-40);
        
        await redis.set(groupHistKey, JSON.stringify(gParsed));
        await redis.set(`chat_hist_${cleanGroupPhone}`, JSON.stringify(gParsed));
        await redis.incr(`chat_unread_${cleanGroupPhone}`);
        await redis.del(`human_read_${cleanGroupPhone}`);

        // Save group JID mapping so the groups API can discover all groups
        await redis.set(`group_jid_${cleanGroupPhone}`, phoneId);
        // Try to capture group name from payload
        const groupSubject = payload.data.groupName || payload.data.subject || payload.data.chatName || payload.data.__raw?.groupMetadata?.subject || '';
        if (groupSubject) {
          await redis.set(`group_subject_${cleanGroupPhone}`, groupSubject);
        }

        // Fetch and cache the group profile picture if not already cached
        const picKey = `profile_pic_${cleanGroupPhone}`;
        const hasPic = await redis.get(picKey);
        if (!hasPic) {
            const configStr = await redis.get('wapp_config');
            const cfg = typeof configStr === 'string' ? JSON.parse(configStr) : (configStr || {});
            if (cfg.wappInstance && cfg.wappToken) {
                try {
                    const picRes = await fetch(`https://gatewaywapp-production.up.railway.app/${cfg.wappInstance}/contacts/profile-picture?token=${cfg.wappToken}&to=${phoneId}`);
                    if (picRes.ok) {
                        const picData = await picRes.json();
                        if (picData?.profile_picture) {
                            await redis.setex(picKey, 86400, picData.profile_picture);
                        } else {
                            await redis.setex(picKey, 86400, 'none');
                        }
                    }
                } catch(e) {}
            }
        }
        
        return NextResponse.json({ success: true, note: 'group_history_saved' });
    }

    // ── 🎟️ VALIDACIÓN DE CUPÓN (FOLIO) ──────────────────────────────────
    const folioMatch = textMsg.match(FOLIO_EXTRACT) || (FOLIO_REGEX.test(textMsg) ? [textMsg] : null);
    if (folioMatch) {
        const configStr = await redis.get('wapp_config');
        const cfg = typeof configStr === 'string' ? JSON.parse(configStr) : (configStr || {});
        const folio = (folioMatch[1] || folioMatch[0]).toUpperCase();
        
        let storeFromMsg = '';
        const leftover = textMsg.replace(FOLIO_EXTRACT, '').trim();
        const leftoverUp = leftover.toUpperCase();
        const selNum = leftover.replace(/\D/g, '');
        
        // Exact dictionary match check first:
        let exactMatch = Object.values(STORE_MAP).find(v => leftoverUp.includes(v.toUpperCase()));
        
        if (exactMatch) {
            storeFromMsg = exactMatch;
        } else if (STORE_MAP[selNum]) {
            storeFromMsg = STORE_MAP[selNum];
        } else if (leftoverUp) {
            for (const [key, name] of Object.entries(STORE_MAP)) {
                 const shortName = name.split(' ').pop().toUpperCase(); 
                 if (leftoverUp.includes(shortName)) {
                      storeFromMsg = name;
                      break;
                 }
            }
        }

        let cleanPhone = '52' + phoneId.replace(/\D/g, '').slice(-10);

        try {
            const folioOwner = await redis.get(`folio_owner_${folio}`);
            if (!folioOwner) {
                await sendWhatsApp(phoneId, '❌ Este folio no existe.', cfg);
                return NextResponse.json({ success: true });
            }

            // FIX#3: Bloquear tanto canjeado como activado
            const folioStatus = await redis.get(`folio_status_${folio}`);
            if (folioStatus === 'canjeado' || folioStatus === 'activado') {
                const statusMsg = folioStatus === 'canjeado'
                    ? '⚠️ Este cupón ya fue canjeado anteriormente.'
                    : '✅ Este cupón ya fue activado. Muestra tu folio en caja para canjearlo.';
                await sendWhatsApp(phoneId, statusMsg, cfg);
                return NextResponse.json({ success: true });
            }

            const validDateStr = await redis.get(`folio_valid_date_${folio}`);
            if (validDateStr) {
                // FIX#6: Usar timezone nativo en vez de offset fijo (DST-safe)
                const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' });
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

            const promoPos = await redis.get(`promo_pos_${folioOwner}`);
            if (promoPos === 'canjeado') {
                await sendWhatsApp(phoneId, '⚠️ Ya canjeaste tu promoción anteriormente.', cfg);
                return NextResponse.json({ success: true });
            }

            // ── 🏪 Si no viene sucursal y NO es flujo de imagen, pedir sucursal ──
            if (!storeFromMsg && !isManagerImageFlow) {
                await redis.set(`pending_folio_store_${cleanPhoneGlobal}`, folio);
                await redis.expire(`pending_folio_store_${cleanPhoneGlobal}`, 600);
                await sendWhatsApp(phoneId, buildStoreMenu(folio), cfg);
                return NextResponse.json({ success: true, note: 'folio_needs_store' });
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

            // FIX#2: Mutex para prevenir doble-activación
            const activationLock = `folio_activating_${folio}`;
            const lockAcquired = await redis.setnx(activationLock, '1');
            if (!lockAcquired) {
                await sendWhatsApp(phoneId, '⏳ Tu cupón se está activando, espera un momento...', cfg);
                return NextResponse.json({ success: true });
            }
            await redis.expire(activationLock, 30);

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
            await redis.del(activationLock);
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

    // Siempre usar clave normalizada con país para evitar duplicados
    let historyKey = `chat_hist_${cleanPhone}@c.us`;
    let history = await redis.get(historyKey) || await redis.get(`chat_hist_${phoneId}`);
    let parsed = typeof history === 'string' ? JSON.parse(history) : (history || []);
    parsed.push({ role: 'user', parts: [{ text: bodyStr, ts: Date.now() }] });
    await redis.incr(`chat_unread_${cleanPhone}`);
    // Reset human-read flag so the chat shows as "needs attention" again
    await redis.del(`human_read_${cleanPhone}`);

    // ── 🛵 DELIVERY MODE: Si el silencio está activo, guardar mensaje pero NO responder ──
    const deliveryActive = await redis.get(`delivery_bot_silence_${cleanPhone}`);
    if (deliveryActive) {
        if (parsed.length > 40) parsed = parsed.slice(-40);
        await redis.set(historyKey, JSON.stringify(parsed));
        await redis.set(`chat_hist_${cleanPhone}@c.us`, JSON.stringify(parsed));
        await redis.set(`chat_hist_${cleanPhone}`, JSON.stringify(parsed));
        console.log(`[Bot] Delivery mode activo para ${cleanPhone} - mensaje guardado, bot silenciado`);
        return NextResponse.json({ success: true, note: 'delivery_mode_silent' });
    }

    if (parsed.length > 40) {
        parsed = parsed.slice(-40);
    }

    // ── 🔍 IDENTIFICACIÓN: Buscar cliente en Loyverse por teléfono ──
    let clientName = null;
    let clientPoints = 0;
    let clientAddress = '';
    let isRegistered = false;
    const cachedName = await redis.get(`client_name_${cleanPhone}`);
    if (cachedName) {
        clientName = cachedName;
        isRegistered = true;
        const cachedPoints = await redis.get(`client_points_${cleanPhone}`);
        clientPoints = parseInt(cachedPoints || '0');
        const cachedAddr = await redis.get(`client_address_${cleanPhone}`);
        if (cachedAddr) clientAddress = cachedAddr;
    } else {
        // FIX#7: Buscar en Loyverse con paginación completa
        try {
            const loyToken = await redis.get('loyverse_token');
            if (loyToken) {
                const clientPhone10 = cleanPhone.slice(-10);
                let match = null;
                let cursor = null;
                let keepSearching = true;
                while (keepSearching) {
                    let url = 'https://api.loyverse.com/v1.0/customers?limit=250';
                    if (cursor) url += `&cursor=${cursor}`;
                    const searchRes = await fetch(url, {
                        headers: { Authorization: `Bearer ${loyToken}` }
                    });
                    if (!searchRes.ok) break;
                    const searchData = await searchRes.json();
                    match = (searchData.customers || []).find(c => {
                        if (!c.phone_number) return false;
                        return c.phone_number.replace(/\D/g, '').slice(-10) === clientPhone10;
                    });
                    if (match) break;
                    cursor = searchData.cursor || null;
                    keepSearching = !!cursor;
                }
                if (match) {
                    clientName = match.name;
                    clientPoints = match.total_points || 0;
                    isRegistered = true;
                    // Extract address
                    let addr = match.address || '';
                    if (match.city) addr += (addr ? ', ' : '') + match.city;
                    clientAddress = addr.trim();
                    // Cachear en Redis para no buscar cada vez
                    await redis.set(`client_name_${cleanPhone}`, clientName);
                    await redis.set(`client_points_${cleanPhone}`, String(clientPoints));
                    await redis.set(`client_registered_${cleanPhone}`, '1');
                    if (clientAddress) await redis.set(`client_address_${cleanPhone}`, clientAddress);
                }
            }
        } catch(lookupErr) { console.error('[Bot] Loyverse lookup error:', lookupErr); }
    }

    // ── 🟢 CLIENTE REGISTRADO: Respuestas determinísticas con estados ──
    if (isRegistered && clientName) {
        const menuMsg = `¿En qué te puedo ayudar? 😊\n\n1️⃣ Ver Menú 📋\n2️⃣ Pedido a Domicilio 🛵\n3️⃣ Pedir para Pasar 🏃`;
        const userText = bodyStr.trim().toLowerCase();
        const botState = await redis.get(`bot_state_${cleanPhone}`);
        let botReply = '';

        // ── Sub-flujo: Confirmación de menú ──
        if (botState === 'awaiting_menu_confirm') {
            await redis.del(`bot_state_${cleanPhone}`);
            const isSi = /^(s[iíì]|si|sí|yes|ok|va|dale|claro|porfa|por favor|manda|1)$/i.test(userText) || userText.includes('si') || userText.includes('sí');
            const isNo = /^(no|nel|nop|nah|2)$/i.test(userText);

            if (isNo) {
                botReply = `Ok 👍 Entonces dime, ¿en qué te puedo ayudar?\n\n1️⃣ Ver Menú 📋\n2️⃣ Pedido a Domicilio 🛵\n3️⃣ Pedir para Pasar 🏃`;
            } else {
                // Sí o cualquier otra cosa → enviar imagen del menú
                const menuImageUrl = 'https://global-sales-prediction.vercel.app/menu-mayo-2025.jpg';
                const menuCaption = '🍔🌶️ ¡Aquí tienes nuestro menú *El Diablito*! 😈\n\n¿Se te antoja algo?\n2️⃣ Pedido a Domicilio 🛵\n3️⃣ Pedir para Pasar 🏃';
                try {
                    await fetch(`https://gatewaywapp-production.up.railway.app/${cfg.wappInstance}/messages/image`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ token: cfg.wappToken, to: phoneId, image: menuImageUrl, caption: menuCaption })
                    });
                } catch(e) { console.error('[Bot] Error enviando imagen menú:', e); }
                parsed.push({ role: 'model', parts: [{ text: menuCaption, ts: Date.now(), attachmentType: 'image', hasAttachment: true, attachmentUrl: menuImageUrl }] });
                if (parsed.length > 40) parsed = parsed.slice(-40);
                await redis.set(historyKey, JSON.stringify(parsed));
                await redis.set(`chat_hist_${cleanPhone}@c.us`, JSON.stringify(parsed));
                await redis.set(`chat_hist_${cleanPhone}`, JSON.stringify(parsed));
                return NextResponse.json({ success: true });
            }
        }
        // ── Opción 1: Ver Menú → preguntar confirmación ──
        else if (textMsg === '1' || /\bmen[uú]\b/i.test(userText) || /\bver men/i.test(userText) || /\bcarta\b/i.test(userText)) {
            botReply = `📋 ¿Quieres que te mande el *Menú*?\n\n👉 Responde *Sí* o *No*`;
            await redis.setex(`bot_state_${cleanPhone}`, 300, 'awaiting_menu_confirm');
        }
        // ── Opción 2 explícita: Pedido a Domicilio ──
        else if (textMsg === '2') {
            botReply = `🛵 Muy bien *${clientName}*, ¿entonces quieres pedir a domicilio verdad? 🍔🔥`;
            await redis.set(`delivery_mode_${cleanPhone}`, '1');
            await redis.setex(`delivery_bot_silence_${cleanPhone}`, 3600, '1');
            console.log(`[Bot] Delivery mode activado para ${cleanPhone} - opción 2 explícita`);
        }
        // ── Opción 3 explícita: Pedir para Pasar ──
        else if (textMsg === '3') {
            botReply = `🏃 Muy bien *${clientName}*, ¿entonces quieres pedir para pasar a recoger verdad? 🍔🔥`;
            await redis.set(`delivery_mode_${cleanPhone}`, '1');
            await redis.setex(`delivery_bot_silence_${cleanPhone}`, 3600, '1');
            console.log(`[Bot] Pickup mode activado para ${cleanPhone} - opción 3 explícita`);
        }
        // ── Default: IA clasifica intención (domicilio / pasar a recoger / ninguno) ──
        else {
            let orderType = 'none'; // none, delivery, pickup
            try {
                const aiToken = cfg.aiToken;
                if (aiToken) {
                    const classifyRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${aiToken}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{ role: 'user', parts: [{ text: `Eres un clasificador de una hamburguesería. El cliente escribió: "${bodyStr}"\n\nClasifica la intención del cliente:\n- Si quiere PEDIR A DOMICILIO (que le lleven comida a su casa), responde: DOMICILIO\n- Si quiere PEDIR PARA PASAR A RECOGER (pickup, pasar por su comida), responde: PASAR\n- Si quiere ORDENAR COMIDA pero no especifica cómo, responde: DOMICILIO\n- Si NO quiere ordenar comida, responde: NINGUNO\n\nResponde SOLO con una palabra: DOMICILIO, PASAR o NINGUNO.` }] }],
                            generationConfig: { maxOutputTokens: 5, temperature: 0.1 }
                        })
                    });
                    if (classifyRes.ok) {
                        const classifyData = await classifyRes.json();
                        const answer = (classifyData.candidates?.[0]?.content?.parts?.[0]?.text || '').trim().toUpperCase();
                        if (answer.includes('DOMICILIO')) orderType = 'delivery';
                        else if (answer.includes('PASAR')) orderType = 'pickup';
                    }
                }
            } catch(e) { console.error('[Bot] Error clasificando intención:', e); }

            if (orderType === 'delivery') {
                botReply = `🛵 Muy bien *${clientName}*, ¿entonces quieres pedir a domicilio verdad? 🍔🔥`;
                await redis.set(`delivery_mode_${cleanPhone}`, '1');
                await redis.setex(`delivery_bot_silence_${cleanPhone}`, 3600, '1');
                console.log(`[Bot] Delivery mode activado para ${cleanPhone} - IA detectó domicilio`);
            } else if (orderType === 'pickup') {
                botReply = `🏃 Muy bien *${clientName}*, ¿entonces quieres pedir para pasar a recoger verdad? 🍔🔥`;
                await redis.set(`delivery_mode_${cleanPhone}`, '1');
                await redis.setex(`delivery_bot_silence_${cleanPhone}`, 3600, '1');
                console.log(`[Bot] Pickup mode activado para ${cleanPhone} - IA detectó pasar a recoger`);
            } else {
                botReply = `¡Hola *${clientName}*! 🍔 Qué gusto verte de vuelta. 😊\n\n${menuMsg}`;
            }
        }

        if (botReply) {
            const botMsgId = await sendWhatsApp(phoneId, botReply, cfg);
            const botEntry = { text: botReply, ts: Date.now(), status: 'sent' };
            if (botMsgId) { botEntry.msgId = botMsgId; await trackMsgId(botMsgId, cleanPhone); }
            parsed.push({ role: 'model', parts: [botEntry] });
            if (parsed.length > 40) parsed = parsed.slice(-40);
            await redis.set(historyKey, JSON.stringify(parsed));
            await redis.set(`chat_hist_${cleanPhone}@c.us`, JSON.stringify(parsed));
            await redis.set(`chat_hist_${cleanPhone}`, JSON.stringify(parsed));
        }
        return NextResponse.json({ success: true });
    }

    // ── 🔴 CLIENTE NO REGISTRADO: Primer contacto ──
    if (parsed.length === 1) {
        await sendWhatsApp(phoneId, '¡Hola! 👋🍔 Bienvenido a *El Diablito Boneless & Burgers*', cfg);
        await new Promise(r => setTimeout(r, 800));
        await sendWhatsApp(phoneId, 'Veo que en nuestro sistema aún no estás registrado. Nos tomará 1 minuto ⏱️, solo compárteme tu *Nombre Completo* 🙋 y tu *Dirección* 📍, al completar tu registro recibes una 🍔 *BURGER GRATIS* 🎁', cfg);
        parsed.push({ role: 'model', parts: [{ text: 'Hola! Bienvenido al Diablito. Veo que en nuestro sistema aún no estás registrado. Nos tomará 1 minuto, solo compárteme tu Nombre Completo y tu Dirección, al completar tu registro recibes una BURGER GRATIS.', ts: Date.now() }] });
        await redis.set(historyKey, JSON.stringify(parsed));
        await redis.set(`chat_hist_${cleanPhone}@c.us`, JSON.stringify(parsed));
        await redis.set(`chat_hist_${cleanPhone}`, JSON.stringify(parsed));
        return NextResponse.json({ success: true });
    }

    // ── 🔴 CLIENTE NO REGISTRADO: Seguimiento (IA para extraer nombre+dirección) ──

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
        let systemContext = botPrompt + '\n\n# REGLAS DE FORMATO Y ESTILO OBLIGATORIAS:\n1. NUNCA respondas con texto plano o aburrido.\n2. Usa abundantes emojis relacionados a comida (🍔, 🍟, 🌶️, 🔥, 🎁, 🎉).\n3. Usa saltos de línea constantes para que el texto respire y no sea un bloque enorme.\n4. Usa *negritas* para resaltar las palabras clave (como *Gratis*, *Descuentos*, *Nombre*, *Dirección*).\n5. Usa listas con viñetas reales (• o 🟢 o ➡️) si tienes que enumerar cosas.\n6. NUNCA digas que no puedes mostrar el menú. Si el cliente pregunta por el menú o no sabe qué pedir, invítalo a ver nuestro catálogo completo dando clic en el ícono de la tiendita/catálogo aquí en el chat de WhatsApp 🛍️.\nTu tono es enérgico, relajado, súper amigable y antojadizo.\n\n# CONTEXTO AUTOMÁTICO\n';
        
        if (isRegistered) {
            systemContext += `El cliente YA ESTÁ REGISTRADO. Se llama ${clientName || 'Cliente'} y actualmente tiene ${clientPoints} PUNTOS acumulados.
Su número es: ${clientPhone10}. (No pidas su número).
NUNCA le ofrezcas registrarse de nuevo ni le ofrezcas el Cupón de Bienvenida (ya lo usó).

INTERACCIÓN FRECUENTE (MENÚ PRINCIPAL):
1) Pedido a Domicilio: Si el cliente selecciona la opción 1 o pide un pedido a domicilio, pregúntale qué productos/delicias se le antojan hoy.${clientAddress ? ` Además, confírmale su dirección guardada diciéndole: "¿Te lo enviamos a *${clientAddress}*? 📍". Si el cliente dice que sí o no corrige, usa esa dirección.` : ' Como no tiene dirección guardada, también pídele su dirección de entrega.'} NO menciones que un asesor confirmará el pedido.

# REGLA PARA PEDIDOS A DOMICILIO (¡MUY IMPORTANTE!):
Si el cliente expresa que quiere hacer un pedido, pedir comida, o elige la opción 1, SIEMPRE DEBES agregar al final de tu mensaje la etiqueta invisible exactamente así: [DOMICILIO_OK]
Si no la pones, el sistema de cocina fallará.

2) Revisar Puntos: Si el cliente selecciona la opción 2 o pregunta por sus puntos, confírmale amablemente que tiene exactamente "${clientPoints} puntos" e infórmale que puede canjearlos como dinero o descuentos al comprar en sucursal.
3) Editar Datos: Si el cliente selecciona la opción 3 o pide cambiar su domicilio, pregúntale cuál será su nueva dirección y su nombre, y actualízalo usando la etiqueta secreta de actualización.


# REGLA PARA ACTUALIZAR DATOS:
Cuando el cliente te haya dado nuevos datos (nombre y nueva dirección) para actualizar su perfil, DEBES confirmar el cambio añadiendo exactamente esta línea invisible al final de tu mensaje:
[REGISTRO_OK:nombre_nuevo|nueva_dirección|ciudad]
Ejemplo: "¡Listo, he actualizado tu domicilio! [REGISTRO_OK:Oscar|Bosques 102|Monterrey]"`;
        } else {
            systemContext += `El cliente es NUEVO, no está registrado en la base de datos.
Su número es: ${clientPhone10}. (No le pidas su número, ya lo tienes).
Tu objetivo principal es invitarlo a registrarse cordialmente para que reciba el Cupón de Bienvenida (Hamburguesa Gratis).

# REGLA ESTRICTA DE FLUJO (EVASIÓN DE TEMAS):
Si el cliente te pregunta cualquier otra cosa, te dice piropos, muestra enojo o saca cualquier otro tema, NO VAMOS A AVANZAR. Debes "driblar" ese mensaje, diciéndole algo como "Sí, te entiendo" o "Muchas gracias", pero SIEMPRE insistiendo al final que si no se registra (dando su nombre y dirección) no podemos avanzar con el pedido o proceso. NO respondas dudas de menú ni otras cosas hasta que se registre.

# REGLA DE REGISTRO CRÍTICA:
Para registrarlo, necesitas que te diga su Nombre y su Dirección.
LO MÍNIMO que necesitas de dirección es: calle, número y colonia. Si el cliente te da más datos (municipio, ciudad, código postal), extráelos también, pero NO insistas en pedirlos si ya te dio calle, número y colonia.

SIEMPRE al final de tu respuesta agrega UNO de estos tags según lo que hayas detectado en toda la conversación:
- Si tiene NOMBRE Y DIRECCIÓN: [REGISTRO_OK:nombre|dirección|ciudad]
- Si SOLO tiene NOMBRE (sin dirección): [SOLO_NOMBRE:nombre]
- Si SOLO tiene DIRECCIÓN (sin nombre): [SOLO_DIRECCION:dirección]
- Si NO tiene NADA: [NADA]

Ejemplos:
- Cliente dijo "Me llamo Oscar Rodriguez" → tu respuesta + [SOLO_NOMBRE:Oscar Rodriguez]
- Cliente dijo "Vivo en Cirros 102 Col Las Nubes" → tu respuesta + [SOLO_DIRECCION:Cirros 102 Col Las Nubes]
- Cliente dijo "Oscar Rodriguez, Cirros 102 Col Las Nubes" → tu respuesta + [REGISTRO_OK:Oscar Rodriguez|Cirros 102 Col Las Nubes|]
- Cliente dijo algo random sin datos → tu respuesta + [NADA]

IMPORTANTE: Revisa TODA la conversación previa. Si en un mensaje anterior dio su nombre y ahora da su dirección, ya tienes ambos datos: usa [REGISTRO_OK].

# FORMATO OBLIGATORIO AL CONFIRMAR REGISTRO:
Cuando confirmes el registro, responde cualquier cosa y agrega el tag [REGISTRO_OK:nombre|dirección|ciudad].
NUNCA omitas el tag.`;
        }

        // ── 📦 INYECTAR CATÁLOGO DE PRODUCTOS AL CONTEXTO DEL BOT ──
        try {
            const catalogRaw = await redis.get('catalog_products');
            const catalog = catalogRaw ? (typeof catalogRaw === 'string' ? JSON.parse(catalogRaw) : catalogRaw) : [];
            const visibleProducts = (Array.isArray(catalog) ? catalog : []).filter(p => !p.isHidden);
            if (visibleProducts.length > 0) {
                systemContext += '\n\n# 📋 MENÚ / CATÁLOGO DE PRODUCTOS DISPONIBLES:\n';
                systemContext += 'Cuando el cliente pregunte por el menú, productos, precios o qué hay disponible, usa ESTA lista actualizada:\n\n';
                visibleProducts.forEach((p, i) => {
                    const price = p.price > 0 ? `$${(p.price / 100).toFixed(2)} MXN` : 'Precio no disponible';
                    systemContext += `${i + 1}. *${p.name}* — ${price}`;
                    if (p.description) systemContext += ` (${p.description})`;
                    if (p.retailerId) systemContext += ` [SKU: ${p.retailerId}]`;
                    systemContext += '\n';
                });
                systemContext += '\nSi el cliente pide algo que NO está en esta lista, dile amablemente que por el momento solo manejas estos productos.\n';
            }
        } catch (catErr) { console.error('[Bot] Error loading catalog:', catErr); }

        // System instruction va aparte en Gemini, pero lo metemos como primer user+model exchange
        geminiContents.push({ role: 'user', parts: [{ text: 'Instrucciones del sistema: ' + systemContext }] });
        geminiContents.push({ role: 'model', parts: [{ text: 'Entendido, seguiré estas instrucciones al pie de la letra. Ya tengo el número del cliente y el menú actualizado.' }] });

        for (const entry of parsed) {
            const role = entry.role === 'user' ? 'user' : 'model';
            const text = entry.parts?.[0]?.text || '';
            if (text) geminiContents.push({ role, parts: [{ text }] });
        }

        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${aiToken}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: geminiContents,
                generationConfig: {
                    maxOutputTokens: 1024,
                    temperature: 0.7
                }
            })
        });

        if (geminiRes.ok) {
            const geminiData = await geminiRes.json();
            const reply = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';

            // ── 📋 Detectar si la IA encontró nombre+dirección ──
            const regMatch = reply.match(/\[REGISTRO_OK:([^|]+)\|([^|]+)\|([^\]]*)\]/);

            if (regMatch) {
                // ── ✅ REGISTRO DETECTADO: Mensaje determinístico de confirmación ──
                const clientData = { name: regMatch[1].trim(), address: regMatch[2].trim(), city: regMatch[3].trim() };
                const confirmMsg = `¡Perfecto *${clientData.name}*! 🎉🔥\n\n¡Ya estás registrado! 🚀 Tu 🍔 *BURGER GRATIS* de bienvenida te espera.\n\n¿En qué te ayudo hoy?\n\n1️⃣ Ver Menú 📋\n2️⃣ Pedido a Domicilio 🛵\n3️⃣ Pedir para Pasar 🏃`;
                
                const confirmMsgId = await sendWhatsApp(phoneId, confirmMsg, cfg);
                const confirmEntry = { text: confirmMsg, ts: Date.now(), status: 'sent' };
                if (confirmMsgId) { confirmEntry.msgId = confirmMsgId; await trackMsgId(confirmMsgId, cleanPhone); }
                parsed.push({ role: 'model', parts: [confirmEntry] });
                await redis.set(historyKey, JSON.stringify(parsed));
                await redis.set(`chat_hist_${cleanPhone}@c.us`, JSON.stringify(parsed));
                await redis.set(`chat_hist_${cleanPhone}`, JSON.stringify(parsed));

                // ── Ejecutar registro en Loyverse ──
                try {
                    if (clientData.name) {
                        const loyverseToken = await redis.get('loyverse_token');
                        if (loyverseToken) {
                            let existingCustomerId = null;
                            try {
                                // Búsqueda directa por teléfono — evita duplicados sin importar cuántos clientes haya
                                const searchRes = await fetch(
                                    `https://api.loyverse.com/v1.0/customers?phone_number=${encodeURIComponent(clientPhone10)}&limit=10`,
                                    { headers: { Authorization: `Bearer ${loyverseToken}` } }
                                );
                                if (searchRes.ok) {
                                    const searchData = await searchRes.json();
                                    const match = (searchData.customers || []).find(c => {
                                        if (!c.phone_number) return false;
                                        return c.phone_number.replace(/\D/g, '').slice(-10) === clientPhone10;
                                    });
                                    if (match) existingCustomerId = match.id;
                                }
                            } catch(srchErr) { console.error('[Bot] Error buscando cliente:', srchErr); }

                            const alreadyRegistered = await redis.get(`client_registered_${cleanPhone}`);
                            if (alreadyRegistered && existingCustomerId) {
                                const updatePayload = { id: existingCustomerId, name: clientData.name };
                                if (clientData.address) updatePayload.address = clientData.address;
                                if (clientData.city) updatePayload.city = clientData.city;
                                try { await fetch('https://api.loyverse.com/v1.0/customers', { method: 'POST', headers: { Authorization: `Bearer ${loyverseToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(updatePayload) }); } catch(e) {}
                                await redis.set(`client_name_${cleanPhone}`, clientData.name);
                            } else if (existingCustomerId) {
                                const updatePayload = { id: existingCustomerId, name: clientData.name };
                                if (clientData.address) updatePayload.address = clientData.address;
                                if (clientData.city) updatePayload.city = clientData.city;
                                try { await fetch('https://api.loyverse.com/v1.0/customers', { method: 'POST', headers: { Authorization: `Bearer ${loyverseToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(updatePayload) }); } catch(e) {}
                                await redis.set(`client_registered_${cleanPhone}`, '1');
                                await redis.set(`client_name_${cleanPhone}`, clientData.name);
                            } else {
                                const customerPayload = { name: clientData.name, phone_number: clientPhone10, address: clientData.address || '', city: clientData.city || '', note: 'Tienda: WhatsApp\nRegistrado via WhatsApp Bot' };
                                const createRes = await fetch('https://api.loyverse.com/v1.0/customers', { method: 'POST', headers: { Authorization: `Bearer ${loyverseToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(customerPayload) });
                                if (createRes.ok) {
                                    await redis.set(`client_registered_${cleanPhone}`, '1');
                                    await redis.set(`client_store_${cleanPhone}`, 'WhatsApp');
                                    await redis.set(`client_name_${cleanPhone}`, clientData.name);
                                    if (clientData.address) await redis.set(`client_address_${cleanPhone}`, clientData.address + (clientData.city ? ', ' + clientData.city : ''));

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
                                                    if (welcomePromo.id) { await redis.set(`folio_promo_id_${folioW}`, welcomePromo.id); await redis.incr(`promo_sent_count_${welcomePromo.id}`); }
                                                    let endpoint = '/messages/chat';
                                                    let wBody = { token: cfg.wappToken, to: cleanPhone + '@c.us', body: promoText };
                                                    if (welcomePromo.image) { endpoint = '/messages/image'; wBody = { token: cfg.wappToken, to: cleanPhone + '@c.us', image: `https://global-sales-prediction.vercel.app/api/promotions/image?id=${welcomePromo.id}&ts=${Date.now()}`, caption: promoText }; }
                                                    const gwRes = await fetch(`https://gatewaywapp-production.up.railway.app/${cfg.wappInstance}${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(wBody) });
                                                    if (gwRes.ok) {
                                                        await redis.set(`promo_pos_${cleanPhone}`, 'naranja');
                                                        const couponHistEntry = { role: 'model', parts: [{ text: promoText, ts: Date.now(), ...(welcomePromo.image ? { attachmentType: 'image', hasAttachment: true, attachmentUrl: `https://global-sales-prediction.vercel.app/api/promotions/image?id=${welcomePromo.id}` } : {}) }] };
                                                        parsed.push(couponHistEntry);
                                                        await redis.set(historyKey, JSON.stringify(parsed));
                                                        await redis.set(`chat_hist_${cleanPhone}@c.us`, JSON.stringify(parsed));
                                                        await redis.set(`chat_hist_${cleanPhone}`, JSON.stringify(parsed));
                                                    }
                                                    await redis.del(mutexKey);
                                                }
                                            }
                                        }
                                    } catch(cupErr) { console.error('[Bot] Error enviando cupón bienvenida:', cupErr); }
                                } else { console.error('[Bot] Error creando cliente en Loyverse:', await createRes.text()); }
                            }
                        }
                    }
                } catch(regErr) { console.error('[Bot] Error en auto-registro:', regErr); }

            } else {
                // ── 🔍 Detectar datos parciales ──
                const nameMatch = reply.match(/\[SOLO_NOMBRE:([^\]]+)\]/);
                const addrMatch = reply.match(/\[SOLO_DIRECCION:([^\]]+)\]/);
                let insistMsg = '';

                if (nameMatch) {
                    // Tiene nombre, falta dirección
                    const detectedName = nameMatch[1].trim();
                    const needAddrVariants = [
                        `¡Gracias *${detectedName}*! 😊 Solo me falta tu *Dirección* 📍 (calle, #, colonia) para completar tu registro y enviarte tu 🍔 *BURGER GRATIS* 🎁`,
                        `¡Perfecto *${detectedName}*! 🙌 Ya tengo tu nombre. Ahora compárteme tu *Dirección* 📍 (calle, #, colonia) y listo, ¡recibes tu 🍔 *BURGER GRATIS*! 🎁`,
                        `¡Excelente *${detectedName}*! 🔥 Ya casi terminamos. Solo escríbeme tu *Dirección* 📍 para darte de alta y mandarte tu 🍔 *BURGER GRATIS*. 🎁`,
                        `👋 *${detectedName}*, ¡ya casi! Solo falta tu *Dirección* 📍 (calle, #, colonia) para registrarte. ¡Tu 🍔 *BURGER GRATIS* te espera! 🎁`,
                        `✨ *${detectedName}*, estamos a un paso. Mándame tu *Dirección* 📍 y te registro con tu 🍔 *BURGER GRATIS* incluida. 🎁`
                    ];
                    insistMsg = needAddrVariants[Math.floor(Math.random() * needAddrVariants.length)];
                } else if (addrMatch) {
                    // Tiene dirección, falta nombre
                    const needNameVariants = [
                        '😊 ¡Ya tengo tu dirección! Solo me falta tu *Nombre Completo* 🙋 para completar tu registro y enviarte tu 🍔 *BURGER GRATIS* 🎁',
                        '🙌 ¡Perfecto, ya tengo tu dirección! Ahora compárteme tu *Nombre Completo* 🙋 y listo, ¡recibes tu 🍔 *BURGER GRATIS*! 🎁',
                        '🔥 ¡Ya casi! Solo escríbeme tu *Nombre Completo* 🙋 para darte de alta. ¡Tu 🍔 *BURGER GRATIS* te espera! 🎁',
                        '✨ ¡Estamos a un paso! Mándame tu *Nombre Completo* 🙋 y te registro con tu 🍔 *BURGER GRATIS* incluida. 🎁',
                        '👋 ¡Ya tengo tu dirección guardada! Solo falta tu *Nombre Completo* 🙋 para completar el registro. 🍔 *BURGER GRATIS* garantizada. 🎁'
                    ];
                    insistMsg = needNameVariants[Math.floor(Math.random() * needNameVariants.length)];
                } else {
                    // No tiene nada
                    const needBothVariants = [
                        '😊 Para poder ayudarte primero necesito registrarte. Solo compárteme tu *Nombre Completo* 🙋 y tu *Dirección* 📍 y recibes tu 🍔 *BURGER GRATIS* 🎁',
                        '🍔 ¡Me encantaría ayudarte! Pero primero necesito tu *Nombre Completo* y *Dirección* para registrarte. ¡Además recibes una *BURGER GRATIS*! 🎁',
                        '🔥 ¡No te pierdas tu *BURGER GRATIS*! Solo escríbeme tu *Nombre Completo* y *Dirección* y listo. 🎁',
                        '🙌 Solo necesito dos cositas: tu *Nombre Completo* y tu *Dirección*. ¡Y te llevas una 🍔 *BURGER GRATIS* de regalo!',
                        '🚀 ¡Regístrate en 1 minuto! Solo dime tu *Nombre* 🙋 y *Dirección* 📍. Tu 🍔 *BURGER GRATIS* está lista.',
                        '✨ ¡Es súper rápido! Compárteme tu *Nombre* y *Dirección* y te damos de alta con tu 🍔 *BURGER GRATIS* incluida. 🎁',
                        '😎 ¡Antes de todo, hay que registrarte! Compárteme tu *Nombre* y *Dirección* y recibes una 🍔 *BURGER GRATIS* de bienvenida. 🌶️'
                    ];
                    insistMsg = needBothVariants[Math.floor(Math.random() * needBothVariants.length)];
                }

                const insistMsgId = await sendWhatsApp(phoneId, insistMsg, cfg);
                const insistEntry = { text: insistMsg, ts: Date.now(), status: 'sent' };
                if (insistMsgId) { insistEntry.msgId = insistMsgId; await trackMsgId(insistMsgId, cleanPhone); }
                parsed.push({ role: 'model', parts: [insistEntry] });
                await redis.set(historyKey, JSON.stringify(parsed));
                await redis.set(`chat_hist_${cleanPhone}@c.us`, JSON.stringify(parsed));
                await redis.set(`chat_hist_${cleanPhone}`, JSON.stringify(parsed));
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
