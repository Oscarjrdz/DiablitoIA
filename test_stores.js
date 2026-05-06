import { Redis } from '@upstash/redis';

// Load env vars
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

async function main() {
  const token = await redis.get('loyverse_token');
  console.log('Loyverse Token:', token ? 'Exists' : 'Missing');

  const res = await fetch('https://api.loyverse.com/v1.0/stores', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  console.log('Stores:');
  for (const s of data.stores || []) {
    console.log(`- ${s.name} (ID: ${s.id})`);
  }
}

main().catch(console.error);
