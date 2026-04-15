require('dotenv').config({ path: __dirname + '/global-sales-prediction/.env.local' });
const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

async function main() {
  const groupId = await redis.get('ventas_grupo_id');
  console.log('ventas_grupo_id IS:', groupId);
}
main();
