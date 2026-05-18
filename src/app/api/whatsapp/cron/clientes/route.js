import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export const maxDuration = 60;

async function sendWhatsApp(to, body, cfg) {
  await fetch(`https://gatewaywapp-production.up.railway.app/${cfg.wappInstance}/messages/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: cfg.wappToken, to, body })
  });
}

const STORE_EMOJIS = {
  'bosques': '🌲', 'valle de lincoln': '🏔️', 'san blas': '⛪',
  'titanio': '⚙️', 'palmas': '🌴', 'real de palmas': '🌴', 'cordillera': '🏔️',
};

function getStoreEmoji(name) {
  const l = name.toLowerCase();
  for (const [k, e] of Object.entries(STORE_EMOJIS)) { if (l.includes(k)) return e; }
  return '🏪';
}

const OPENING_PHRASES = [
  "📢 ¡Actualización de guerra, soldados! ¿Quién lleva más clientes fichados?",
  "🔔 ¡Reporte de reclutamiento! A ver quién se rajó y quién la rompió.",
  "👀 Les traigo los números de clientes... unos brillan y otros preocupan.",
  "📋 Hora de rendir cuentas. ¿Cuántos clientes registraron o nomás calentaron silla?",
  "🎯 ¡Score de cacería de clientes! El que no registra no vende.",
  "🛎️ ¡Campanazo! Reporte de clientes. No se hagan, sí los estamos contando.",
  "📊 ¿Quién anda fichando clientes y quién anda en el celular? Aquí los números.",
  "🔥 Actualización de clientes registrados. El que no aparece... ya saben.",
  "😤 A ver si es cierto que están registrando clientes o nomás dicen que sí.",
  "📢 ¡Sin excusas! Aquí están los números crudos de clientes por tienda.",
  "🧐 Hora del conteo. Unos van como avión y otros como carreta.",
  "💀 Los números no mienten. Reporte de clientes registrados, les guste o no.",
  "🏁 ¡Checkpoint! Vamos viendo quién va ganando la carrera de registros.",
  "🎪 ¡Pasen, pasen! El show de los clientes registrados está a punto de comenzar.",
  "⚡ Flash informativo: reporte de clientes. El que no suma, resta.",
  "🤨 ¿Ya vieron sus números de clientes? Porque yo sí y hay sorpresas...",
  "📡 Transmisión en vivo del marcador de clientes. Prepárense.",
  "🔍 Auditoría express de registros. Nadie se esconde de los números.",
  "🏆 Tabla de posiciones de clientes registrados. ¿Quién va al podio?",
  "😏 Les dejo los numeritos de clientes pa' que vean quién sí jala y quién no.",
];

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const configStr = await redis.get('wapp_config');
    const cfg = typeof configStr === 'string' ? JSON.parse(configStr) : (configStr || {});
    const loyverseToken = await redis.get('loyverse_token');
    const grupoId = await redis.get('ventas_grupo_id');

    if (!loyverseToken) return NextResponse.json({ success: false, reason: 'No loyverse token' });
    if (!grupoId || !grupoId.includes('@g.us')) return NextResponse.json({ success: false, reason: 'No grupo vinculado' });

    const authH = { Authorization: `Bearer ${loyverseToken}` };

    // Check Redis cache first (1 hour TTL)
    const cached = await redis.get('clientes_report_cache');
    let reportData;

    if (cached) {
      reportData = typeof cached === 'string' ? JSON.parse(cached) : cached;
    } else {
      const storesRes = await fetch('https://api.loyverse.com/v1.0/stores', { headers: authH, signal: AbortSignal.timeout(8000) });
      const storesPayload = await storesRes.json();
      const stores = (storesPayload.stores || []).filter(s => !s.name.toLowerCase().includes('prueba'));

      let allCustomers = [], cursor = null, hasMore = true;
      while (hasMore) {
        let url = 'https://api.loyverse.com/v1.0/customers?limit=250';
        if (cursor) url += `&cursor=${cursor}`;
        const cr = await fetch(url, { headers: authH, signal: AbortSignal.timeout(8000) });
        const cd = await cr.json();
        if (cd.customers?.length) allCustomers = allCustomers.concat(cd.customers);
        cursor = cd.cursor || null;
        hasMore = !!cursor;
      }

      const byStore = {};
      let noStore = 0;
      stores.forEach(s => { byStore[s.name] = 0; });

      allCustomers.forEach(c => {
        const note = c.note || '';
        const match = note.match(/Tienda:\s*(.+?)(\n|$)/i);
        if (match) {
          const storeName = match[1].trim();
          if (byStore[storeName] !== undefined) {
            byStore[storeName]++;
          } else {
            const found = Object.keys(byStore).find(k =>
              k.toLowerCase().includes(storeName.toLowerCase()) ||
              storeName.toLowerCase().includes(k.toLowerCase())
            );
            if (found) byStore[found]++;
            else { if (!byStore[storeName]) byStore[storeName] = 0; byStore[storeName]++; }
          }
        } else {
          noStore++;
        }
      });

      reportData = { total: allCustomers.length, byStore, noStore, ts: Date.now() };
      await redis.set('clientes_report_cache', JSON.stringify(reportData), { ex: 3600 });
    }

    // Build compact message
    const now = new Date();
    const hora = now.toLocaleTimeString('es-MX', { timeZone: 'America/Monterrey', hour: '2-digit', minute: '2-digit', hour12: false });
    const opening = OPENING_PHRASES[Math.floor(Math.random() * OPENING_PHRASES.length)];

    let msg = `${opening}\n\n`;
    msg += `👥 *CLIENTES REGISTRADOS* • ⏰ ${hora} hrs\n`;
    msg += `📊 *Total:* ${reportData.total.toLocaleString('es-MX')} clientes\n`;
    msg += `━━━━━━━━━━━━━━━━━━\n`;

    const sorted = Object.entries(reportData.byStore).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    sorted.forEach(([name, count]) => {
      const pct = reportData.total > 0 ? ((count / reportData.total) * 100).toFixed(1) : '0.0';
      msg += `${getStoreEmoji(name)} *${name}*\n`;
      msg += `   👤 ${count} clientes (${pct}%)\n`;
    });

    if (reportData.noStore > 0) {
      msg += `⚪ *Sin tienda:* ${reportData.noStore}\n`;
    }
    const zeroStores = Object.entries(reportData.byStore).filter(([, v]) => v === 0).map(([k]) => k);
    if (zeroStores.length > 0) {
      msg += `⚪ *Sin clientes:* ${zeroStores.join(', ')}\n`;
    }

    msg += `━━━━━━━━━━━━━━━━━━\n`;
    msg += `⚡ _El Diablito Intelligence_`;

    await sendWhatsApp(grupoId, msg, cfg);
    return NextResponse.json({ success: true, sentTo: grupoId });
  } catch (err) {
    console.error('Cron Clientes error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
