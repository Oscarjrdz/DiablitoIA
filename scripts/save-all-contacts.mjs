// Guarda todos los contactos del sistema como contactos de WhatsApp
// Uso: node scripts/save-all-contacts.mjs

import Redis from 'ioredis';

const REDIS_URL = 'redis://default:doyoQnFFAlJoxrhkc3KrRxL1awfSlSjr@redis-18769.c270.us-east-1-3.ec2.cloud.redislabs.com:18769';
const GW = 'https://gatewaywapp-production.up.railway.app';

const redis = new Redis(REDIS_URL);

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

  // Obtener todos los phones del set
  let phones = await redis.smembers('chat_phones');
  if (!phones || phones.length === 0) {
    // Fallback: buscar por keys
    const keys = await redis.keys('chat_hist_*@c.us');
    phones = keys.map(k => k.replace('chat_hist_', '').replace('@c.us', ''));
  }

  console.log(`📋 Total de chats encontrados: ${phones.length}`);

  let ok = 0, skipped = 0, failed = 0;

  for (const phone of phones) {
    // Solo números individuales (no grupos)
    if (phone.includes('@g.us') || phone.includes('group_')) {
      skipped++;
      continue;
    }

    const name = await redis.get(`client_name_${phone}`);
    if (!name || name === phone.slice(-10)) {
      console.log(`⏭️  Sin nombre: ${phone}`);
      skipped++;
      continue;
    }

    const firstName = name.trim().split(' ')[0];
    let cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone.startsWith('52')) cleanPhone = '52' + cleanPhone;

    try {
      const res = await fetch(`${GW}/${cfg.wappInstance}/contacts/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cfg.wappToken}`
        },
        body: JSON.stringify({
          token: cfg.wappToken,
          number: cleanPhone,
          fullName: name.trim(),
          firstName
        })
      });

      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { success: false, error: text }; }

      if (data?.success) {
        console.log(`✅ ${name} (${cleanPhone})`);
        ok++;
      } else {
        console.log(`❌ ${name} (${cleanPhone}): ${data?.error || data?.message || text}`);
        failed++;
      }
    } catch (e) {
      console.log(`❌ ${phone}: ${e.message}`);
      failed++;
    }

    // Pequeña pausa para no saturar el gateway
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\n📊 Resultado: ✅ ${ok} guardados | ⏭️  ${skipped} sin nombre | ❌ ${failed} fallidos`);
  redis.disconnect();
}

main().catch(e => { console.error(e); redis.disconnect(); process.exit(1); });
