const Redis = require('ioredis');
const redis = new Redis("redis://default:doyoQnFFAlJoxrhkc3KrRxL1awfSlSjr@redis-18769.c270.us-east-1-3.ec2.cloud.redislabs.com:18769");

async function diag() {
  const promosInfo = await redis.get('promotions');
  let promos = typeof promosInfo === 'string' ? JSON.parse(promosInfo) : (promosInfo || []);
  const welcomePromo = promos.find(p => p.isWelcomePromo);
  console.log("Welcome promo image?", !!welcomePromo.image);
  
  if (welcomePromo.image) {
    const configStr = await redis.get('wapp_config');
    let wConfig = typeof configStr === 'string' ? JSON.parse(configStr) : (configStr || {});
    const baseUrl = `https://gatewaywapp-production.up.railway.app/${wConfig.wappInstance}`;
    const endpoint = '/messages/image';
    const bodyPayload = {
        token: wConfig.wappToken,
        to: '528116038195@c.us',
        image: `https://global-sales-prediction.vercel.app/api/promotions/image?ts=${Date.now()}`,
        caption: "Prueba de imagen"
    };
    
    console.log("Sending image to:", baseUrl + endpoint);
    const gwRes = await fetch(baseUrl + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload)
    });
    
    const txt = await gwRes.text();
    console.log("Status:", gwRes.status, "Body:", txt);
  }
  process.exit(0);
}
diag();
