import Redis from 'ioredis';
const r = new Redis('redis://default:doyoQnFFAlJoxrhkc3KrRxL1awfSlSjr@redis-18769.c270.us-east-1-3.ec2.cloud.redislabs.com:18769');
async function run() {
  const rawKeys = await r.keys('DEBUG_WEBHOOK_RAW_*');
  rawKeys.sort().reverse();
  for (let i = 0; i < 5; i++) {
    if (!rawKeys[i]) break;
    const val = await r.get(rawKeys[i]);
    try {
      const parsed = JSON.parse(val);
      console.log(rawKeys[i], '->', parsed.type, parsed.created_at);
      if (parsed.type === 'customers.update') {
        console.log('Customer phone:', parsed.customers?.[0]?.phone_number);
        console.log('Customer ID:', parsed.customers?.[0]?.id);
      }
    } catch(e) { console.log('cant parse', rawKeys[i]); }
  }
}
run().then(() => r.quit());
