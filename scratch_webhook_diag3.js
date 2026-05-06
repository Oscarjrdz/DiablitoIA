const Redis = require('ioredis');
const redis = new Redis("redis://default:doyoQnFFAlJoxrhkc3KrRxL1awfSlSjr@redis-18769.c270.us-east-1-3.ec2.cloud.redislabs.com:18769");

async function diag() {
  const promosInfo = await redis.get('promotions');
  let promos = typeof promosInfo === 'string' ? JSON.parse(promosInfo) : (promosInfo || []);
  const welcomePromo = promos.find(p => p.isWelcomePromo);

  const configStr = await redis.get('wapp_config');
  let wConfig = typeof configStr === 'string' ? JSON.parse(configStr) : (configStr || {});

  const cleanPhone = '528116038195';
  
  const toPhoneUri = `${cleanPhone}@c.us`;
  const baseUrl = `https://gatewaywapp-production.up.railway.app/${wConfig.wappInstance}`;
  let endpoint = '/messages/chat';
  let bodyPayload = { token: wConfig.wappToken, to: toPhoneUri, body: "Prueba desde webhook diag" };

  console.log("Sending to:", baseUrl + endpoint);
  const gwRes = await fetch(baseUrl + endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyPayload)
  });

  const txt = await gwRes.text();
  console.log("Status:", gwRes.status, "Body:", txt);
  process.exit(0);
}
diag();
