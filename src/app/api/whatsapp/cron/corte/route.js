import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

async function sendWhatsApp(to, body, cfg) {
  await fetch(`https://gatewaywapp-production.up.railway.app/${cfg.wappInstance}/messages/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: cfg.wappToken, to, body })
  });
}

export async function GET(request) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV !== 'development') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const nowMs = Date.now();
        const lockStr = await redis.get('cron_corte_lock');
        if (lockStr && (nowMs - parseInt(lockStr)) < 45000) {
             return NextResponse.json({ success: false, reason: 'Already executing concurrently, skipping' });
        }
        await redis.set('cron_corte_lock', nowMs.toString());

        const grupoId = await redis.get('ventas_grupo_id');
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

        let alertsSent = 0;
        const shiftRes = await fetch(`https://api.loyverse.com/v1.0/shifts?updated_at_min=${fetchStart}&updated_at_max=${fetchEnd}&limit=100`, { headers: authH });
        if (shiftRes.ok) {
            const shiftData = await shiftRes.json();
            if (shiftData.shifts) {
                for (const shift of shiftData.shifts) {
                    let sObj = stores.find(s => s.id === shift.store_id);
                    if (shift.closed_at) {
                        const closedTime = new Date(shift.closed_at);
                        const diffMinsClosure = (now.getTime() - closedTime.getTime()) / 60000;
                        if (diffMinsClosure >= -60 && diffMinsClosure <= 120) {
                            const lockKey = `shift_alert_${shift.id}`;
                            const alreadySent = await redis.get(lockKey);
                            if (!alreadySent) {
                                await redis.set(lockKey, '1');
                                await redis.expire(lockKey, 86400); 
                                
                                const sObj = stores.find(s => s.id === shift.store_id);
                                let sName = sObj ? sObj.name : 'Desconocida';
                                sName = sName.trim();
                                if (sName.toLowerCase().includes('prueba')) continue;

                                const fmt = n => '$' + (n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 });
                                const msgCierre = `🔔 *Oscar, la tienda ${sName} acaba de cerrar el turno.* \n\n` + 
                                                  `💰 Caja Final: ${fmt(shift.actual_cash)}\n` + 
                                                  `💵 Ventas Netas: ${fmt(shift.net_sales)}\n` +
                                                  `⚡ _El Diablito Intelligence_`;

                                await sendWhatsApp('5218116038195@c.us', msgCierre, cfg);

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

                                if (grupoId && grupoId.includes('@g.us')) {
                                    await sendWhatsApp(grupoId, msgGrupo, cfg);
                                }
                                alertsSent++;
                            }
                        }
                    }
                }
            }
        }

        return NextResponse.json({ success: true, alertsSent });
    } catch (err) {
        console.error('Corte error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
