const Redis = require('ioredis');
const redis = new Redis("redis://default:doyoQnFFAlJoxrhkc3KrRxL1awfSlSjr@redis-18769.c270.us-east-1-3.ec2.cloud.redislabs.com:18769");

async function diag() {
  const promosInfo = await redis.get('promotions');
  let promos = typeof promosInfo === 'string' ? JSON.parse(promosInfo) : (promosInfo || []);
  const welcomePromo = promos.find(p => p.isWelcomePromo);

  const configStr = await redis.get('wapp_config');
  let wConfig = typeof configStr === 'string' ? JSON.parse(configStr) : (configStr || {});

  const cleanPhone = '528116038195';
  
  console.log("welcomePromo found:", !!welcomePromo);
  console.log("wappToken found:", !!wConfig.wappToken, "Instance:", wConfig.wappInstance);
  
  // Also, fetch the last 10 webhook raw logs to see the Gateway response if any
  // But wait, the gateway request doesn't log the body if it fails?
  
  process.exit(0);
}
diag();
