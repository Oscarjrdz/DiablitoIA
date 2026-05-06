import { redis } from './src/lib/redis.js';
async function test() {
  const keys = await redis.keys('*');
  console.log(keys.slice(0, 10));
}
test();
