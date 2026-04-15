import Redis from 'ioredis';
import fs from 'fs';
const r = new Redis('redis://default:doyoQnFFAlJoxrhkc3KrRxL1awfSlSjr@redis-18769.c270.us-east-1-3.ec2.cloud.redislabs.com:18769');
async function run() {
  const p = await r.get('promotions');
  fs.writeFileSync('promos.json', p);
  console.log('Saved to promos.json');
}
run().then(() => r.quit());
