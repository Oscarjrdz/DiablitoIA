import { redis } from './src/lib/redis.js';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
  const loyverseToken = await redis.get('loyverse_token');
  console.log("Got Loyverse token?", !!loyverseToken);
  
  if (loyverseToken) {
    let cursor = null;
    let found = [];
    let count = 0;
    while (true) {
        let url = 'https://api.loyverse.com/v1.0/customers?limit=250';
        if (cursor) url += `&cursor=${cursor}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${loyverseToken}` }});
        if (!res.ok) break;
        const data = await res.json();
        const custs = data.customers || [];
        count += custs.length;
        
        let m = custs.find(c => {
           if (!c.phone_number) return false;
           return c.phone_number.includes('8116038195');
        });
        if (m) found.push(m);
        
        cursor = data.cursor || null;
        if (!cursor) break;
        // stop after 10 loops just in case
        if (count > 2500) break;
    }
    console.log(`Scanned ${count} customers. Found 8116038195?`, found);
  }
  
  const dyn = await redis.keys('*8116038195*');
  console.log("Keys in Redis:", dyn);
}

check().catch(console.error);
