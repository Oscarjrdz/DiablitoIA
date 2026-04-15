import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

async function sendWhatsApp(to, body, cfg) {
  await fetch(`https://gatewaywapp-production.up.railway.app/${cfg.wappInstance}/messages/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: cfg.wappToken, to, body })
  });
}

const ALERT_MESSAGES = [
  "⚠️ Equipo de *{tienda}* , ¿sí abrimos hoy? Llevamos ya {min} minutos sin registrar un solo ticket. ¡Revisen qué pasa!",
  "🚨 Atención *{tienda}* : Han pasado {min} mins desde la última venta. ¿Se cayó el sistema o está vacío? Confirmen.",
  "⏰  *{tienda}* , andamos muy silenciosos... {min} minutos sin cobrar nada. ¿Todo bien por allá?",
  "👀 Ojo en *{tienda}* : el reloj sigue corriendo y ya van {min} min sin tickets. ¡Hay que meterle turbo!",
  "🔌 ¿Equipo de *{tienda}* , tienen luz o sistema? Ya son {min} minutos sin ver movimiento en caja. Repórtense.",
  "⏱️  *{tienda}* , ¿seguimos operando? El sistema marca {min} minutos de inactividad total. ¡Despertemos!",
  "🔔 Alerta de inactividad para *{tienda}* . Llevamos {min} minutos inoperantes en caja. ¿Qué está pasando?",
  "⏳  *{tienda}* , no se me duerman. Hace {min} min que no cae un ticket. Repórtense con el estatus del local.",
  "📉 Bajón detectado en *{tienda}* : llevamos {min} min sin ingresos. ¿Mucha fila y no estamos cobrando?",
  "⚠️ ¡Cuidado *{tienda}* ! Llegamos a {min} minutos sin facturar. ¿Seguros que la caja funciona bien?",
  "🛒 Equipo de *{tienda}* , el punto de venta lleva {min} minutos apagado... bueno, sin tickets. ¿Todo en orden?",
  "🤔  *{tienda}* , ¿cerramos temprano o qué onda? Marca {min} minutos sin ninguna venta cobrada.",
  "📢 Llamado a *{tienda}* : {min} minutos sin sacar tickets es muchísimo tiempo muerto. ¡Aceleren el ritmo!",
  "🛑 Emergencia en caja de *{tienda}* : pasaron {min} min y no se ve actividad. Favor de mandar estatus.",
  "👻 Se ven fantasmas en *{tienda}* ... {min} minutos sin clientes cobrados. ¡Ánimo equipo, a vender!",
  "💤  *{tienda}*  entró en modo suspenso. Llevamos {min} minutos de ceros absolutos. ¡A reactivarse!",
  "🔔  *{tienda}* , el monitor de ventas está trabado o de plano llevan {min} min sin ventas. Avisen novedades.",
  "👀 Monitoreo de seguridad: *{tienda}*  cumple {min} mins con 0 tickets. Confirmar que estemos operando normal.",
  "🚨  *{tienda}* : ¡Foco rojo! {min} minutos exactos sin transacciones. ¿Tenemos algún freno operativo?",
  "🔥 ¡Pilas *{tienda}* ! Ya pasaron {min} minutos desde el último cobro. ¡A capturar todas las ventas de la fila!",
  "🐒 ¿Se nos escaparon los monos en *{tienda}* ? {min} minutos sin ventas, pónganse las pilas que esto no es asueto.",
  "💀 El punto de venta de *{tienda}*  ya huele a muerto... {min} minutos sin latas. ¡Revívanlo!",
  "🐢 Equipo *{tienda}* , ni las tortugas van tan lento. Ya son {min} minutotes sin tickets. ¿Qué pasó?",
  "👽 ¿Los abdujeron los ovnis en *{tienda}* ? Porque llevan {min} minutos sin dar señales de vida en caja.",
  "🛌 ¿Ya sacaron las cobijas en *{tienda}* ? Llevan {min} minutos roncando sin pasar un solo cliente.",
  "🕸️ Ya le están saliendo telarañas a la caja de *{tienda}* ... {min} minutos sin sonar. ¡Sacúdanse!",
  "🏜️ Hay más movimiento en el desierto que en *{tienda}* . {min} minutos sin agua... digo, sin ventas.",
  "📢 Alerta roja en *{tienda}* : {min} minutos de puro aire. ¿Se cerró la puerta por dentro o qué?",
  "🧘‍♂️ Mucha meditación zen en *{tienda}* ... {min} min de silencio absoluto. Acelérense un poquito, ¿no?",
  "🕵️ Buscando a los cajeros de *{tienda}* . {min} minutos extraviados del sistema. Repórtense con tickets.",
  "🧊 Se nos congeló el changarro en *{tienda}* . {min} minutotes bien fríos sin vender. ¡A calentar la caja!",
  "🦉 Cri cri... cri cri... Así suenan los grillos en *{tienda}*  desde hace {min} minutos. ¡Despierten!",
  "🎪 ¿Se nos fue el circo en *{tienda}* ? Porque tenemos {min} minutos de pura comedia sin vender nada.",
  "🐌 El caracol superó a *{tienda}* . Van {min} minutos de arrastre sin cobros. Exijan clientes.",
  "🕳️ ¿Se tragó un agujero negro la caja de *{tienda}* ? {min} minutos perdidos en el espacio tiempo sin tickets.",
  "🏴‍☠️ Nos robaron los clientes en *{tienda}*  o qué onda. {min} minutos con la caja vacía.",
  "🚑 Manden ambulancia a *{tienda}* , el punto de venta lleva {min} minutos infartado sin registrar.",
  "🛸 ¿Se llevaron el iPad los marcianos en *{tienda}* ? Porque hace {min} minutos que no la tocan.",
  "🎩 Magia pura en *{tienda}* : desaparecieron las ventas por {min} minutos. Ya saquen el conejo.",
  "🪦 Descansa en paz turno de *{tienda}* ... {min} min sin respirar. ¡Inyéctenle adrenalina a esa caja!"
];

export async function GET(request) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV !== 'development') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        // Bloqueo de Concurrencia (Mutex) de 45 segundos para que si Vercel retries o le pican al Webhook a la misma vez, no salgan 2 mensajes
        const nowMs = Date.now();
        const lockStr = await redis.get('sla_cron_lock');
        if (lockStr && (nowMs - parseInt(lockStr)) < 45000) {
             return NextResponse.json({ success: false, reason: 'Already executing concurrently, skipping' });
        }
        await redis.set('sla_cron_lock', nowMs.toString());

        // ── CORTE AUTOMÁTICO A LAS 7 AM ──
        // Si son antes de las 7:00 AM hora Monterrey, silenciar alertas de inactividad.
        // Esto protege contra encargados que olvidan sacar el corte de caja.
        const nowMty = new Date();
        const mtyHour = parseInt(nowMty.toLocaleTimeString('en-US', { timeZone: 'America/Monterrey', hour: '2-digit', hour12: false }));
        if (mtyHour < 7) {
            return NextResponse.json({ success: true, reason: 'Fuera de horario operativo (antes de 7 AM MTY) – alertas de inactividad silenciadas' });
        }


        const grupoId = await redis.get('ventas_grupo_id');
        if (!grupoId || !grupoId.includes('@g.us')) {
            return NextResponse.json({ success: false, reason: 'No group configured' });
        }

        const configStr = await redis.get('wapp_config');
        const cfg = typeof configStr === 'string' ? JSON.parse(configStr) : (configStr || {});
        const loyverseToken = await redis.get('loyverse_token');
        if (!loyverseToken) return NextResponse.json({ success: false, reason: 'No loyverse token' });

        const authH = { Authorization: `Bearer ${loyverseToken}` };
        const storesRes = await fetch('https://api.loyverse.com/v1.0/stores', { headers: authH });
        const { stores } = await storesRes.json();

        const now = new Date();
        const mtyStr = now.toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' });
        const [ty, tm, td] = mtyStr.split('-').map(Number);
        
        const fetchStart = new Date(Date.UTC(ty, tm - 1, td - 1, 12, 0, 0)).toISOString();
        const fetchEnd = new Date(Date.UTC(ty, tm - 1, td + 1, 12, 0, 0)).toISOString();

        // Check for Recently Closed Shifts
        try {
            const shiftRes = await fetch(`https://api.loyverse.com/v1.0/shifts?updated_at_min=${fetchStart}&updated_at_max=${fetchEnd}&limit=100`, { headers: authH });
            if (shiftRes.ok) {
                const shiftData = await shiftRes.json();
                if (shiftData.shifts) {
                    for (const shift of shiftData.shifts) {
                        if (shift.closed_at) {
                            const closedTime = new Date(shift.closed_at);
                            const diffMinsClosure = (now.getTime() - closedTime.getTime()) / 60000;
                            // Check if closed within the last 15 minutes
                            if (diffMinsClosure >= 0 && diffMinsClosure <= 15) {
                                const lockKey = `shift_alert_${shift.id}`;
                                const alreadySent = await redis.get(lockKey);
                                if (!alreadySent) {
                                    await redis.set(lockKey, '1');
                                    await redis.expire(lockKey, 86400); // 24 hours lock
                                    
                                    const sObj = stores.find(s => s.id === shift.store_id);
                                    let sName = sObj ? sObj.name : 'Desconocida';
                                    sName = sName.trim();

                                    const fmt = n => '$' + (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 });
                                    const msgCierre = `🔔 *Oscar, la tienda ${sName} acaba de cerrar el turno.* \n\n` + 
                                                      `💰 Caja Final: ${fmt(shift.actual_cash)}\n` + 
                                                      `💵 Ventas Netas: ${fmt(shift.net_sales)}\n` +
                                                      `⚡ _El Diablito Intelligence_`;

                                    // MANDAR AL ADMIN
                                    await sendWhatsApp('5218116038195@c.us', msgCierre, cfg);

                                    // Mensaje para Grupo (Sin Dinero, Con Tiempo)
                                    const oTime = new Date(shift.opened_at);
                                    const cTime = new Date(shift.closed_at);
                                    const diffMsShift = cTime.getTime() - oTime.getTime();
                                    const totalMins = Math.floor(diffMsShift / 60000);
                                    const h = Math.floor(totalMins / 60);
                                    const m = totalMins % 60;
                                    const actStr = `${h} horas y ${m} minutos`;
                                    
                                    const mtyOpts = { timeZone: 'America/Monterrey', hour: '2-digit', minute: '2-digit', hour12: false };
                                    const fmtOpen = oTime.toLocaleTimeString('es-MX', mtyOpts);
                                    const fmtClose = cTime.toLocaleTimeString('es-MX', mtyOpts);

                                    const msgGrupo = `Hola!! Tienda *${sName}* acaba de hacer el corte,\nabrió a las ${fmtOpen} y cerró a las ${fmtClose},\n*${actStr} de actividad*\n\n⚡ _El Diablito Intelligence_`;

                                    // MANDAR AL GRUPO AHORA
                                    if (grupoId && grupoId.includes('@g.us')) {
                                        await sendWhatsApp(grupoId, msgGrupo, cfg);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } catch(shiftErr) {
            console.error('Shift fetch err:', shiftErr);
        }

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

        // ── Solo contar tickets de DESPUÉS de las 7 AM hora Monterrey ──
        // Las ventas de madrugada NO cuentan para inactividad.
        // El ciclo de alertas solo arranca con el primer ticket después de las 7 AM.
        const todayReceipts = allReceipts.filter(r => {
            if (r.cancelled_at) return false;
            const rDate = new Date(r.created_at);
            if (rDate.toLocaleDateString('en-CA', { timeZone: 'America/Monterrey' }) !== mtyStr) return false;
            // Ignorar tickets de antes de las 7 AM Monterrey
            const rHour = parseInt(rDate.toLocaleTimeString('en-US', { timeZone: 'America/Monterrey', hour: '2-digit', hour12: false }));
            return rHour >= 7;
        });

        const ps = {};
        stores.forEach(s => { 
            if (s.name.toLowerCase().includes('prueba')) return;
            ps[s.id] = { name: s.name.trim(), t: 0, lastTime: null }; 
        });

        todayReceipts.forEach(r => {
            const isRef = r.receipt_type === 'REFUND';
            if (!isRef && ps[r.store_id]) { 
                ps[r.store_id].t++;
                const rTime = new Date(r.created_at);
                if (!ps[r.store_id].lastTime || rTime > ps[r.store_id].lastTime) {
                    ps[r.store_id].lastTime = rTime;
                }
            }
        });

        let alerts = [];
        Object.values(ps).forEach(s => {
            // Evaluamos solo si tiene más de 0 tickets y última hora registrada
            if (s.t > 0 && s.lastTime) {
                const diffMs = now.getTime() - s.lastTime.getTime();
                const diffMins = Math.floor(diffMs / 60000);
                
                if (diffMins >= 30) {
                    const rndIdx = Math.floor(Math.random() * ALERT_MESSAGES.length);
                    let alertText = ALERT_MESSAGES[rndIdx];
                    // El {tienda} ya está formateado en el arreglo con los asteriscos fijos y espacios seguros (ej. *{tienda}* )
                    alertText = alertText.replace(/{tienda}/g, s.name).replace(/{min}/g, diffMins);
                    alerts.push(alertText);
                }
            }
        });

        if (alerts.length > 0) {
            // Construimos la alerta final
            const finalAlertStr = `🚨 *Hola grupo* 🚨\n\n🔴 *RUTINA DE INACTIVIDAD* 🔴\n\n` + alerts.join('\n\n') + `\n\n⚡ _El Diablito Intelligence_`;
            
            // Enviamos el mensaje al grupo
            await sendWhatsApp(grupoId, finalAlertStr, cfg);
            return NextResponse.json({ success: true, alertsSent: alerts.length });
        }

        return NextResponse.json({ success: true, reason: 'All stores within SLA limit' });
    } catch (err) {
        console.error('SLA error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
