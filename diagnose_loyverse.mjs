// Diagnóstico usando ioredis directo
import Redis from 'ioredis';

const REDIS_URL = 'redis://default:doyoQnFFAlJoxrhkc3KrRxL1awfSlSjr@redis-18769.c270.us-east-1-3.ec2.cloud.redislabs.com:18769';

const r = new Redis(REDIS_URL, { lazyConnect: true });
await r.connect();

async function rGet(key) {
  const val = await r.get(key);
  if (!val) return null;
  try { return JSON.parse(val); } catch { return val; }
}

console.log('🔍 Diagnóstico del sistema de cupones por POS\n');

// 1. Ver payloads RAW del Loyverse webhook
const rawKeys = await r.keys('DEBUG_WEBHOOK_RAW_*');
console.log(`📦 Payloads del Loyverse webhook guardados: ${rawKeys.length}`);
if (rawKeys.length > 0) {
  rawKeys.sort((a, b) => Number(b.split('_').pop()) - Number(a.split('_').pop()));
  const lastKey = rawKeys[0];
  const lastPayload = await rGet(lastKey);
  console.log(`\n🕐 Último payload (${lastKey}):`);
  if (lastPayload) {
    console.log(JSON.stringify(lastPayload, null, 2).substring(0, 3000));
  } else {
    console.log('(vacío)');
  }
} else {
  console.log('  ⚠️  Ningún payload guardado. El webhook de Loyverse NUNCA llegó al servidor.');
}

// 2. Estado del número de prueba
const testPhone = '528116038195';
console.log(`\n📱 Estado del número de prueba (${testPhone}):`);
const promoPos = await rGet(`promo_pos_${testPhone}`);
const promoFolio = await rGet(`promo_folio_${testPhone}`);
const resetLock = await rGet(`reset_lock_${testPhone}`);
console.log(`  promo_pos_   : ${promoPos ?? '(vacío ✅)'}`);
console.log(`  promo_folio_ : ${promoFolio ?? '(vacío ✅)'}`);
console.log(`  reset_lock_  : ${resetLock ?? '(sin lock ✅)'}`);

// 3. Verificar webhooks en Loyverse
const loyverseToken = await rGet('loyverse_token');
const wappConfig = await rGet('wapp_config');
console.log(`\n🔑 Loyverse token: ${loyverseToken ? loyverseToken.substring(0, 20) + '...' : '❌ no encontrado'}`);
console.log(`🤖 Bot config: instance=${wappConfig?.wappInstance || '?'} token=${wappConfig?.wappToken ? '✅' : '❌'}`);

console.log('\n🔗 Webhooks configurados en Loyverse:');
try {
  const whRes = await fetch('https://api.loyverse.com/v1.0/webhooks', {
    headers: { Authorization: `Bearer ${loyverseToken}` }
  });
  if (whRes.ok) {
    const whData = await whRes.json();
    const hooks = whData.webhooks || [];
    if (hooks.length === 0) {
      console.log('  ❌ NO hay webhooks registrados en Loyverse. Este es el problema raíz.');
    } else {
      for (const h of hooks) {
        const icon = h.enabled !== false ? '✅' : '🔴';
        console.log(`  ${icon} tipo=[${h.type || h.event_type || JSON.stringify(Object.keys(h))}]`);
        console.log(`     url=${h.network_url || h.url || 'N/A'}`);
        console.log(`     id=${h.id}`);
      }
    }
  } else {
    const errText = await whRes.text();
    console.log(`  ❌ Error Loyverse API ${whRes.status}: ${errText.substring(0, 300)}`);
  }
} catch(e) {
  console.error(`  ❌ Error conectando: ${e.message}`);
}

// 4. Último receipt debug
const lastReceipt = await rGet('DEBUG_RECEIPT');
console.log('\n🧾 Último receipt procesado:');
if (lastReceipt) {
  const receiptData = typeof lastReceipt === 'object' ? lastReceipt : {};
  const receipts = receiptData?.receipts || (receiptData?.events?.[0]?.data ? [receiptData.events[0].data.receipt] : [receiptData]);
  for (const rec of receipts.slice(0, 2)) {
    if (!rec) continue;
    console.log(`  receipt_number: ${rec.receipt_number || 'N/A'}`);
    console.log(`  customer_id   : ${rec.customer_id || '⚠️ NONE (sin cliente en ticket)'}`);
    console.log(`  store_id      : ${rec.store_id || 'N/A'}`);
    console.log(`  line_items    : ${(rec.line_items || []).length}`);
  }
} else {
  console.log('  ❌ No hay receipts guardados.');
}

// 5. Último error
const wbError = await rGet('DEBUG_WEBHOOK_ERROR');
if (wbError) {
  console.log('\n❌ Último error del webhook de Loyverse:');
  console.log(String(wbError).substring(0, 500));
}

// 6. Simular llamada al webhook desde nuestro lado para probar
console.log('\n🧪 Probando endpoint del webhook con número de prueba...');
const testPayload = {
  type: 'customers.update',
  data: {
    customer: {
      id: 'test-id-sim',
      name: 'Oscar Prueba',
      phone_number: '8116038195',
      total_visits: 0,
      total_points: 0,
      total_spent: '0'
    }
  }
};
try {
  const simRes = await fetch('https://global-sales-prediction.vercel.app/api/loyverse/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testPayload)
  });
  const simData = await simRes.json();
  console.log(`  Status: ${simRes.status}`);
  console.log(`  Response: ${JSON.stringify(simData)}`);
} catch(e) {
  console.error(`  Error: ${e.message}`);
}

r.quit();
console.log('\n✅ Diagnóstico completo.');
