import { Redis } from '@upstash/redis';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});
async function run() {
  try {
    const keys = await redis.keys('chat_hist_*@c.us');
    console.log('keys length', keys.length);
    if(keys.length > 0) {
      const phones = keys.map(k => k.replace('chat_hist_', '').replace('@c.us', ''));
      const metaKeys = phones.flatMap(p => [
        `client_name_${p}`,
        `chat_unread_${p}`,
        `client_store_${p}`,
        `human_read_${p}`,
        `delivery_mode_${p}`
      ]);
      console.log('metaKeys length', metaKeys.length);
      const res = await redis.mget(...metaKeys);
      console.log('mget res length', res.length);
    }
  } catch(e) {
    console.error('ERROR', e);
  }
}
run();
