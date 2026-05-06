const Redis = require('ioredis');
const redis = new Redis("redis://default:doyoQnFFAlJoxrhkc3KrRxL1awfSlSjr@redis-18769.c270.us-east-1-3.ec2.cloud.redislabs.com:18769");

async function diag() {
  const dWebhook = await redis.get('DEBUG_WEBHOOK_CUSTOMER');
  const dRaw = await redis.get('DEBUG_WEBHOOK_RAW_' + Date.now()); // not exact
  const dErr = await redis.get('DEBUG_WEBHOOK_ERROR');
  const promos = await redis.get('promotions');
  
  const phone = '528116038195';
  const repo1 = await redis.get(`reset_lock_${phone}`);
  const repo2 = await redis.get(`promo_pos_${phone}`);
  const repo3 = await redis.get(`client_store_${phone}`);
  const repo4 = await redis.get(`coupon_sending_${phone}`);
  
  console.log({
     reset_lock: repo1,
     promo_pos: repo2,
     client_store: repo3,
     coupon_sending: repo4,
     error: dErr
  });
  
  try {
     console.log('Customer Data:', JSON.parse(dWebhook));
  } catch(e) {}
  
  process.exit(0);
}
diag();
