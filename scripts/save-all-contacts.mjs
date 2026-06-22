// Guarda todos los contactos del sistema como contactos de WhatsApp
// Uso: node scripts/save-all-contacts.mjs

import Redis from 'ioredis';

const REDIS_URL = 'redis://default:doyoQnFFAlJoxrhkc3KrRxL1awfSlSjr@redis-18769.c270.us-east-1-3.ec2.cloud.redislabs.com:18769';
const GW = 'https://gatewaywapp-production.up.railway.app';
const DELAY_MS = 1500; // 1.5s entre llamadas para no golpear rate limit
const MAX_RETRIES = 3;

const redis = new Redis(REDIS_URL);

async function saveContact(instanceId, token, phone, name, retries = 0) {
  const firstName = name.trim().split(' ')[0];
  let cleanPhone = phone.replace(/\D/g, '');
  if (!cleanPhone.startsWith('52')) cleanPhone = '52' + cleanPhone;

  try {
    const res = await fetch(`${GW}/${instanceId}/contacts/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ token, number: cleanPhone, fullName: name.trim(), firstName })
    });

    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { success: false, error: text }; }

    if (data?.success) return { ok: true };

    const errMsg = data?.error || data?.message || text || 'unknown';

    // Si hay rate-limit, esperar más y reintentar
    if (errMsg.includes('rate') && retries < MAX_RETRIES) {
      const waitMs = DELAY_MS * (retries + 2);
      console.log(`  ⏳ Rate limit, esperando ${waitMs}ms... (intento ${retries + 1}/${MAX_RETRIES})`);
      await new Promise(r => setTimeout(r, waitMs));
      return saveContact(instanceId, token, phone, name, retries + 1);
    }

    return { ok: false, error: errMsg };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function main() {
  console.log('🔌 Conectando a Redis...');

  // Obtener config del gateway
  const configRaw = await redis.get('wapp_config');
  const cfg = typeof configRaw === 'string' ? JSON.parse(configRaw) : (configRaw || {});

  if (!cfg.wappInstance || !cfg.wappToken) {
    console.error('❌ Gateway no configurado en Redis (falta wappInstance o wappToken)');
    process.exit(1);
  }
  console.log(`✅ Gateway: ${cfg.wappInstance}`);
  console.log(`⏱️  Delay entre contactos: ${DELAY_MS}ms\n`);

  // Obtener todos los phones del set
  let phones = await redis.smembers('chat_phones');
  if (!phones || phones.length === 0) {
    const keys = await redis.keys('chat_hist_*@c.us');
    phones = keys.map(k => k.replace('chat_hist_', '').replace('@c.us', ''));
  }

  // Filtrar solo individuales con nombre
  const candidates = [];
  for (const phone of phones) {
    if (phone.includes('@g.us') || phone.includes('group_')) continue;
    const name = await redis.get(`client_name_${phone}`);
    if (!name || name === phone.slice(-10)) continue;
    candidates.push({ phone, name });
  }

  console.log(`📋 Chats totales: ${phones.length}`);
  console.log(`👤 Con nombre (a agregar): ${candidates.length}\n`);

  let ok = 0, failed = 0;
  const failedList = [];

  for (let i = 0; i < candidates.length; i++) {
    const { phone, name } = candidates[i];
    process.stdout.write(`[${i + 1}/${candidates.length}] ${name} (${phone.slice(-10)})... `);

    const result = await saveContact(cfg.wappInstance, cfg.wappToken, phone, name);

    if (result.ok) {
      console.log('✅');
      ok++;
    } else {
      console.log(`❌ ${result.error}`);
      failed++;
      failedList.push({ phone, name, error: result.error });
    }

    if (i < candidates.length - 1) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  console.log(`\n📊 Resultado:`);
  console.log(`  ✅ Guardados: ${ok}`);
  console.log(`  ❌ Fallidos:  ${failed}`);

  if (failedList.length > 0) {
    console.log(`\n⚠️  Fallidos:`);
    for (const f of failedList) {
      console.log(`  - ${f.name} (${f.phone}): ${f.error}`);
    }
  }

  redis.disconnect();
}

main().catch(e => { console.error(e); redis.disconnect(); process.exit(1); });
