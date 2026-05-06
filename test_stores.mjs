import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

async function run() {
  const redis = new Redis(process.env.REDIS_URL);
  const token = await redis.get('loyverse_token');
  console.log('Token exists:', !!token);
  
  if (!token) return;
  
  const res = await fetch('https://api.loyverse.com/v1.0/stores', {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  const data = await res.json();
  data.stores.forEach(s => {
    console.log(`- ${s.name} (ID: ${s.id})`);
  });
  process.exit(0);
}
run();
