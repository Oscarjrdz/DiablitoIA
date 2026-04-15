
const { Redis } = require('@upstash/redis');

// I need the Upstash Redis credentials. Let's read them from .env.local
require('dotenv').config({ path: '/Users/oscar/.gemini/antigravity/brain/62626d89-0a77-463c-94ab-8a96e4ca936b/DIABLITO IA/global-sales-prediction/.env.local' });

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

async function main() {
  const keys = await redis.keys('dash:*');
  if (keys.length === 0) {
    console.log('No cache keys found.');
    return;
  }
  
  // Pick the most recent cache or any large cache
  console.log('Found keys:', keys);
  const data = await redis.get(keys[0]);
  
  if (!data || !data.receipts) {
    console.log('No receipts in cache.');
    return;
  }
  
  const receipts = data.receipts;
  console.log('Total receipts in cache:', receipts.length);
  
  let found = 0;
  for (const r of receipts) {
    if (r.line_items) {
      for (const item of r.line_items) {
        let matched = false;
        
        const itemName = (item.item_name || '').toLowerCase();
        if (itemName.includes('cris') || itemName.includes('gajo') || itemName.includes('papa')) {
          console.log('\n[MATCHED ITEM]', item.item_name);
          console.log(JSON.stringify(item, null, 2));
          matched = true;
          found++;
        }
        
        if (item.modifiers) {
          for (const mod of item.modifiers) {
            const modName = (mod.name || '').toLowerCase();
            if (modName.includes('cris') || modName.includes('gajo') || modName.includes('papa')) {
              console.log('\n[MATCHED MODIFIER in item:', item.item_name, ']');
              console.log('  Mod:', mod.name, 'price:', mod.price, 'money_amount:', mod.money_amount);
              // Dump full item context just in case
              console.log(JSON.stringify(item, null, 2));
              matched = true;
              found++;
            }
          }
        }
        
        if (found > 3) break;
      }
    }
    if (found > 3) break;
  }
  
  if (found === 0) {
    console.log('No papas found in this cache segment.');
  }
}

main().catch(console.error);
