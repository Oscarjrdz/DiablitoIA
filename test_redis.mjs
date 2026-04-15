import { Redis } from '@upstash/redis';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

async function main() {
  const g = await redis.get('ventas_grupo_id');
  console.log('ventas_grupo_id:', g);
  const cfg = await redis.get('wapp_config');
  console.log('wapp_config:', cfg);
  const inst = await redis.get('ultramsg_instances');
  console.log('ultramsg_instances:', inst);
}
main().catch(console.error);
