import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { generateFolio, buildPromoText } from '@/lib/folio';

export async function POST(req) {
  try {
    const payload = await req.json();
    await redis.set('DEBUG_WEBHOOK_RAW_' + Date.now(), JSON.stringify(payload));
    console.log('Loyverse Webhook received:', JSON.stringify(payload).substring(0, 500));
    
    // Save the receipt payload to Redis for debugging
    await redis.set('DEBUG_RECEIPT', payload);

    // Handle RECEIPT creation (Delete item and mark as redeemed)
    const eventType = payload?.events?.[0]?.type || payload?.type;
    if (eventType === 'receipts.update' || eventType === 'receipt') {
      const receiptsList = payload?.receipts || (payload?.events?.[0]?.data?.receipt ? [payload.events[0].data.receipt] : []);
      
      for (const receipt of receiptsList) {
        // --- FIX: Map store from receipt to customer ---
        if (receipt.store_id && receipt.customer_id) {
          try {
            const loyverseToken = await redis.get('loyverse_token');
            const [custRes, storeRes] = await Promise.all([
              fetch(`https://api.loyverse.com/v1.0/customers/${receipt.customer_id}`, { headers: { Authorization: `Bearer ${loyverseToken}` } }),
              fetch(`https://api.loyverse.com/v1.0/stores`, { headers: { Authorization: `Bearer ${loyverseToken}` } })
            ]);
            
            if (custRes.ok && storeRes.ok) {
              const custData = await custRes.json();
              const storeData = await storeRes.json();
              
              if (custData.phone_number) {
                // Normalización robusta: 52 + últimos 10 dígitos
                let rPhone = '52' + custData.phone_number.replace(/\D/g, '').slice(-10);
                
                const sObj = (storeData.stores || []).find(s => s.id === receipt.store_id);
                if (sObj) {
                  await redis.set(`client_store_${rPhone}`, sObj.name);
                  
                  // Update Loyverse Note string to ensure store persists in CRM
                  const currentNote = custData.note || '';
                  if (!currentNote.includes('Tienda:')) {
                     const newNote = currentNote ? `${currentNote}\nTienda: ${sObj.name}` : `Tienda: ${sObj.name}`;
                     const updatePayload = {
                        id: custData.id,
                        name: custData.name || 'Cliente',
                        phone_number: custData.phone_number,
                        note: newNote
                     };
                     if (custData.address) updatePayload.address = custData.address;
                     if (custData.city) updatePayload.city = custData.city;
                     
                     try {
                        await fetch('https://api.loyverse.com/v1.0/customers', {
                           method: 'POST',
                           headers: { Authorization: `Bearer ${loyverseToken}`, 'Content-Type': 'application/json' },
                           body: JSON.stringify(updatePayload)
                        });
                     } catch(e) { console.error('Failed to update loyverse customer note', e); }
                  }
                  
                  // Post-Purchase WhatsApp Notification
                  if (receipt.receipt_number) {
                     const lock = await redis.get(`receipt_msg_${receipt.receipt_number}`);
                     if (!lock) {
                         await redis.set(`receipt_msg_${receipt.receipt_number}`, '1');
                         
                         const configStr = await redis.get('wapp_config');
                         const wConfig = configStr ? (typeof configStr === 'string' ? JSON.parse(configStr) : configStr) : null;
                         const wappInstance = wConfig?.wappInstance;
                         const wappToken = wConfig?.wappToken;
                         
                         if (wappInstance && wappToken) {
                             // ── CUPÓN DE BIENVENIDA PARA CLIENTE NUEVO VÍA TICKET ──────────────
                             const existingPromoPos = await redis.get(`promo_pos_${rPhone}`);
                             const resetLockW = await redis.get(`reset_lock_${rPhone}`);
                             if (!existingPromoPos && !resetLockW) {
                                try {
                                   const promosInfoW = await redis.get('promotions');
                                   const promosW = promosInfoW ? (typeof promosInfoW === 'string' ? JSON.parse(promosInfoW) : promosInfoW) : [];
                                   const welcomePromoW = promosW.find(p => p.isWelcomePromo);
                                   if (welcomePromoW) {
                                      const mutexKey = `coupon_sending_${rPhone}`;
                                      const acquired = await redis.setnx(mutexKey, '1');
                                      if (acquired) {
                                         await redis.expire(mutexKey, 30);
                                         const folioW = generateFolio();
                                         const { text: promoTextRawW, validDate: validDateW } = buildPromoText(welcomePromoW.text, folioW, welcomePromoW.validFrom, welcomePromoW.validityDuration);
                                         const promoTextW = promoTextRawW.replace(/{nombre_de_cliente}/g, custData.name || '');
                                         await redis.set(`promo_folio_${rPhone}`, folioW);
                                         await redis.set(`folio_item_name_${folioW}`, welcomePromoW.itemName || 'Burger Gratis');
                                         await redis.set(`folio_owner_${folioW}`, rPhone);
                                         await redis.set(`folio_valid_date_${folioW}`, validDateW);
                                         if (welcomePromoW.id) {
                                            await redis.set(`folio_promo_id_${folioW}`, welcomePromoW.id);
                                            await redis.incr(`promo_sent_count_${welcomePromoW.id}`);
                                         }
                                         const welcomeBody = {
                                            token: wappToken,
                                            to: rPhone + '@c.us',
                                            body: promoTextW
                                         };
                                         const resW = await fetch(`https://gatewaywapp-production.up.railway.app/${wappInstance}/messages/chat`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify(welcomeBody)
                                         });
                                         await resW.text().catch(()=>null);
                                         await redis.set(`promo_pos_${rPhone}`, 'naranja');
                                         await redis.del(mutexKey);
                                         console.log(`[Receipt] Cupón de bienvenida enviado a ${rPhone} (nuevo cliente)`);
                                      }
                                   }
                                } catch(eW) { console.error('Error enviando cupón bienvenida en receipt:', eW); }
                             }
                             // ────────────────────────────────────────────────────────────────────
                             
                            const nameToUse = custData.name || 'Cliente';
                            const points = custData.total_points || 0;
                            const msgText = `Hola ${nameToUse} Gracias por visitar el diablito ${sObj.name} tienes acumulados hasta ahora ${points} puntos, te esperamos pronto.`;
                            
                            const reqBody = {
                               number: rPhone,
                               options: { delay: 1200, presence: "composing" },
                               textMessage: { text: msgText }
                            };
                            
                            try {
                               await fetch(`https://gatewaywapp-production.up.railway.app/${wappInstance}/message/sendText`, {
                                  method: 'POST',
                                  headers: {
                                     'Content-Type': 'application/json',
                                     'apikey': wappToken
                                  },
                                  body: JSON.stringify(reqBody)
                               });

                               // ---- TRIGGER PROMOTIONS ENGINE ----
                               const promosInfo = await redis.get('promotions');
                               const promos = promosInfo ? (typeof promosInfo === 'string' ? JSON.parse(promosInfo) : promosInfo) : [];
                               
                               // Sincr. Robusta: Aseguramos que la visita de este receipt sume 1 si Loyverse viene retrasado.
                               let loyverseTotal = parseInt(custData.total_visits || 0);
                               let cachedVisits = parseInt(await redis.get(`loyverse_visits_${rPhone}`) || 0);
                               
                               // Sincronización Matemática Flawless: max(cached + 1, loyverseTotal)
                               // Esto evita que saltemos compras erróneamente cuando Loyverse sincroniza instantáneo.
                               let visits = Math.max(cachedVisits + 1, loyverseTotal);
                               await redis.set(`loyverse_visits_${rPhone}`, visits);
                               
                               const spent = parseFloat(custData.total_spent || 0);

                               let limiteVentas = false;
                               for (const promo of promos) {
                                  if (promo.isWelcomePromo) continue;
                                  if (limiteVentas) {
                                      break; // ABSOLUTE LIMIT: Solo 1 cupón de VENTA en este ticket!
                                  }
                                  let triggered = false;
                                  let lockKey = '';

                                  if (promo.visitTriggers) {
                                     const vTriggers = promo.visitTriggers.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
                                     for (const t of vTriggers) {
                                        if (visits >= t) {
                                           const sent = await redis.get(`promo_sent_${rPhone}_v_${t}`);
                                           if (!sent) { triggered = true; lockKey = `promo_sent_${rPhone}_v_${t}`; break; }
                                        }
                                     }
                                  }

                                  if (!triggered && promo.spendTriggers) {
                                     const sTriggers = promo.spendTriggers.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
                                     for (const t of sTriggers) {
                                        if (spent >= t) {
                                           const sent = await redis.get(`promo_sent_${rPhone}_s_${t}`);
                                           if (!sent) { triggered = true; lockKey = `promo_sent_${rPhone}_s_${t}`; break; }
                                        }
                                     }
                                  }

                                  if (triggered) {
                                     await redis.set(lockKey, '1');
                                     const folio = generateFolio();
                                     const { text: promoTextRaw, validDate } = buildPromoText(promo.text, folio, promo.validFrom, promo.validityDuration);
                                     const customerName = custData.name || '';
                                     const promoText = promoTextRaw.replace(/{nombre_de_cliente}/g, customerName);

                                     await redis.set(`promo_folio_${rPhone}`, folio);
                                     await redis.set(`folio_item_name_${folio}`, promo.itemName || 'Burger Gratis');
                                     await redis.set(`folio_owner_${folio}`, rPhone);
                                     await redis.set(`folio_valid_date_${folio}`, validDate);
                                     await redis.set(`folio_promo_id_${folio}`, promo.id);
                                     await redis.set(`promo_pos_${rPhone}`, 'naranja'); // unlock redemption
                                     await redis.incr(`promo_sent_count_${promo.id}`);

                                     let endpoint = '/messages/chat';
                                     let promoReqBody = {
                                        token: wappToken,
                                        to: rPhone + '@c.us',
                                        body: promoText
                                     };
                                     if (promo.image && promo.image.trim() !== '') {
                                        endpoint = '/messages/image';
                                        promoReqBody = {
                                           token: wappToken,
                                           to: rPhone + '@c.us',
                                           image: `https://global-sales-prediction.vercel.app/api/promotions/image?id=${promo.id}&ts=${Date.now()}`,
                                           caption: promoText
                                        };
                                     }
                                     let resPromo = await fetch(`https://gatewaywapp-production.up.railway.app/${wappInstance}${endpoint}`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify(promoReqBody)
                                     });
                                     
                                     // FALLBACK: Si falla la imagen, enviar como texto plano
                                     if (!resPromo.ok && endpoint === '/messages/image') {
                                         resPromo = await fetch(`https://gatewaywapp-production.up.railway.app/${wappInstance}/messages/chat`, {
                                             method: 'POST',
                                             headers: { 'Content-Type': 'application/json' },
                                             body: JSON.stringify({
                                                 token: wappToken,
                                                 to: rPhone + '@c.us',
                                                 body: promoText
                                             })
                                         });
                                     }
                                     await resPromo.text().catch(()=>null);
                                     limiteVentas = true; // Activar el candado, no se enviarán más promos iterables este turno
                                  }
                               }
                            } catch(e) { console.error('Error post-purchase msg', e); }
                         }
                     }
                  }
                }
              }
            }
          } catch (e) {
            console.log('Error linking store to customer:', e);
          }
        }
        // -----------------------------------------------

        if (receipt && receipt.line_items) {
          for (const item of receipt.line_items) {
            const skuRegex = /^[A-Z]\d{4}$/i;
            if (item.sku && skuRegex.test(item.sku)) {
              const folio = item.sku.toUpperCase();
              if (folio) {
                 const itemId = await redis.get(`folio_item_id_${folio}`);
                 const loyverseToken = await redis.get('loyverse_token');
                 if (itemId && loyverseToken) {
                   await fetch(`https://api.loyverse.com/v1.0/items/${itemId}`, {
                      method: 'DELETE',
                      headers: { 'Authorization': `Bearer ${loyverseToken}` }
                   });
                 }
                 const ownerPhone = await redis.get(`folio_owner_${folio}`);
                 if (ownerPhone) {
                   await redis.set(`promo_pos_${ownerPhone}`, 'canjeado');
                 }
                 await redis.set(`folio_status_${folio}`, 'canjeado');
                 const promoId = await redis.get(`folio_promo_id_${folio}`);
                 if (promoId) { await redis.incr(`promo_redeem_count_${promoId}`); }
                 
                 // --- LOG REDEMPTION ---
                 try {
                     let storeName = 'Desconocido';
                     let cashierName = receipt.employee_id || 'Desconocido';
                     let customerName = 'Desconocido';
                     
                     if (loyverseToken) {
                         const pStore = receipt.store_id ? fetch(`https://api.loyverse.com/v1.0/stores/${receipt.store_id}`, { headers: { Authorization: `Bearer ${loyverseToken}` } }) : null;
                         const pEmp = receipt.employee_id ? fetch(`https://api.loyverse.com/v1.0/employees/${receipt.employee_id}`, { headers: { Authorization: `Bearer ${loyverseToken}` } }) : null;
                         const pCust = receipt.customer_id ? fetch(`https://api.loyverse.com/v1.0/customers/${receipt.customer_id}`, { headers: { Authorization: `Bearer ${loyverseToken}` } }) : null;
                         
                         const [resStore, resEmp, resCust] = await Promise.all([pStore, pEmp, pCust]);
                         if (resStore && resStore.ok) storeName = (await resStore.json()).name || storeName;
                         if (resEmp && resEmp.ok) cashierName = (await resEmp.json()).name || cashierName;
                         if (resCust && resCust.ok) customerName = (await resCust.json()).name || customerName;
                     }

                     const logEntry = {
                        id: Date.now().toString() + '_' + folio,
                        folio,
                        itemName: item.item_name || 'Item Promocional',
                        storeName,
                        cashierName,
                        customerName,
                        ownerPhone: ownerPhone || 'N/A',
                        receiptNumber: receipt.receipt_number || 'N/A',
                        receiptDate: receipt.created_at || new Date().toISOString(),
                        amount: receipt.total_money || 0,
                     };
                     await redis.lpush('redeemed_coupons_log', JSON.stringify(logEntry));
                 } catch(err) { console.error('Failed to log redemption', err); }
                 
              }
            }
          }
        }
      }
      return NextResponse.json({ success: true, message: 'Receipt handled' });
    }

    // ORIGINAL CUSTOMER ONBOARDING LOGIC
    if (eventType === 'customers.delete' || eventType === 'customer.delete') {
      return NextResponse.json({ success: true, message: 'Ignoring delete event' });
    }

    let customerData = payload?.data?.customer || payload?.data || payload;
    if (payload?.events && payload.events.length > 0) {
       customerData = payload.events[0]?.data?.customer || payload.events[0]?.customer || customerData;
    } else if (payload?.customers && payload.customers.length > 0) {
       customerData = payload.customers[0];
    }
    const storeId = customerData?.store_id || customerData?.storeId || null;
    const phone = customerData?.phone_number || customerData?.phoneNumber || null;

    if (!phone) {
      return NextResponse.json({ success: true, message: 'No phone, skipping' });
    }

    // Normalización robusta: siempre 52 + últimos 10 dígitos
    // Cubre: 8116038195, 18116038195, 528116038195, 5218116038195
    let cleanPhone = '52' + phone.replace(/\D/g, '').slice(-10);

    // Si hay reset_lock activo, NO enviamos cupón (protección post-RESET)
    const resetLock = await redis.get(`reset_lock_${cleanPhone}`);
    if (resetLock) {
      console.log(`[LoyverseWebhook] reset_lock activo para ${cleanPhone}, omitiendo cupón.`);
      return NextResponse.json({ success: true, message: 'reset_lock activo, cupón suprimido' });
    }

    // Mutex anti-duplicado: evitar que dos llamadas simultáneas de customers.update
    // (Loyverse a veces dispara el mismo evento varias veces) generen dos cupones
    const onboardMutex = `coupon_sending_${cleanPhone}`;
    const onboardAcquired = await redis.setnx(onboardMutex, '1');
    if (!onboardAcquired) {
      console.log(`[LoyverseWebhook] Mutex activo para ${cleanPhone}, cupón ya siendo procesado.`);
      return NextResponse.json({ success: true, message: 'cupón deduplicado (mutex activo)' });
    }
    await redis.expire(onboardMutex, 30);

    // Already sent promo? Skip (checa después del mutex para evitar race conditions)
    const alreadySent = await redis.get(`promo_pos_${cleanPhone}`);
    if (alreadySent) {
      await redis.del(onboardMutex);
      return NextResponse.json({ success: true, message: 'Promo already sent' });
    }

    // Resolve store name
    let storeName = '';
    const loyverseToken = await redis.get('loyverse_token');
    if (storeId && loyverseToken) {
      try {
        const storesRes = await fetch('https://api.loyverse.com/v1.0/stores', {
          headers: { Authorization: `Bearer ${loyverseToken}` }
        });
        if (storesRes.ok) {
          const storesData = await storesRes.json();
          const store = (storesData.stores || []).find(s => s.id === storeId);
          if (store) storeName = store.name;
        }
      } catch (e) {
        console.error('Could not resolve store name:', e);
      }
    }

    if (storeName) {
      await redis.set(`client_store_${cleanPhone}`, storeName);
    }

    // Get welcome promo
    const promosInfo = await redis.get('promotions');
    let promos = typeof promosInfo === 'string' ? JSON.parse(promosInfo) : (promosInfo || []);
    const welcomePromo = promos.find(p => p.isWelcomePromo);

    if (!welcomePromo) {
      await redis.set(`promo_pos_${cleanPhone}`, 'rojo');
      return NextResponse.json({ success: true, message: 'No welcome promo configured' });
    }

    const configStr = await redis.get('wapp_config');
    let wConfig = typeof configStr === 'string' ? JSON.parse(configStr) : (configStr || {});

    if (!wConfig.wappInstance || !wConfig.wappToken) {
      await redis.set(`promo_pos_${cleanPhone}`, 'rojo');
      return NextResponse.json({ success: true, message: 'Gateway not configured' });
    }

    // Generate unique folio
    await redis.set('DEBUG_WEBHOOK_CUSTOMER', JSON.stringify(customerData || {}));
    const folio = generateFolio();
    const { text: promoTextRaw, validDate } = buildPromoText(welcomePromo.text, folio, welcomePromo.validFrom, welcomePromo.validityDuration);
    const customerName = customerData?.name || '';
    const promoText = promoTextRaw.replace(/{nombre_de_cliente}/g, customerName);
    await redis.set(`promo_folio_${cleanPhone}`, folio);
    await redis.set(`folio_item_name_${folio}`, welcomePromo.itemName || 'Burger Gratis');
    await redis.set(`folio_owner_${folio}`, cleanPhone);
    await redis.set(`folio_valid_date_${folio}`, validDate);
    if (welcomePromo.id) { await redis.set(`folio_promo_id_${folio}`, welcomePromo.id); }

    const toPhoneUri = `${cleanPhone}@c.us`;
    const baseUrl = `https://gatewaywapp-production.up.railway.app/${wConfig.wappInstance}`;
    let endpoint = '/messages/chat';
    let bodyPayload = { token: wConfig.wappToken, to: toPhoneUri, body: promoText };

    if (welcomePromo.image) {
      endpoint = '/messages/image';
      bodyPayload = {
        token: wConfig.wappToken,
        to: toPhoneUri,
        image: `https://global-sales-prediction.vercel.app/api/promotions/image?id=${welcomePromo.id}&ts=${Date.now()}`,
        caption: promoText
      };
    }

    let gwRes = await fetch(baseUrl + endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyPayload)
    });

    // FALLBACK: Si subida de imagen falla (muy común por IP proxy / WA media bans), reenviar texto
    if (!gwRes.ok && endpoint === '/messages/image') {
       gwRes = await fetch(baseUrl + '/messages/chat', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ token: wConfig.wappToken, to: toPhoneUri, body: promoText })
       });
    }

    if (gwRes.ok) {
      if (welcomePromo.id) { await redis.incr(`promo_sent_count_${welcomePromo.id}`); }
      const sendRes = await gwRes.json();
      await redis.set(`promo_pos_${cleanPhone}`, 'naranja');
      const msgId = sendRes.messageId || sendRes?.key?.id || sendRes?.data?.key?.id;
      if (msgId) await redis.set(`promo_msg_${msgId}`, cleanPhone);
    } else {
      await redis.set(`promo_pos_${cleanPhone}`, 'rojo');
    }
    // Liberar mutex al terminar (sea éxito o fallo)
    await redis.del(onboardMutex);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Loyverse Webhook Error:', error);
    await redis.set('DEBUG_WEBHOOK_ERROR', error.stack || error.message);
    return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
  }
}
