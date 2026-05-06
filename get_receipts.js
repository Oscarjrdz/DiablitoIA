const Redis = require('ioredis');

async function main() {
  const redis = new Redis('redis://default:doyoQnFFAlJoxrhkc3KrRxL1awfSlSjr@redis-18769.c270.us-east-1-3.ec2.cloud.redislabs.com:18769');
  
  const token = await redis.get('loyverse_token');
  if (!token) {
    console.error('No loyverse_token in redis');
    process.exit(1);
  }

  // fetch stores
  const storeRes = await fetch('https://api.loyverse.com/v1.0/stores', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  let storeMap = {};
  if (storeRes.ok) {
    const sData = await storeRes.json();
    for (const s of sData.stores || []) {
      storeMap[s.id] = s.name;
    }
  }

  // Get receipts from loyverse
  const response = await fetch('https://api.loyverse.com/v1.0/receipts?limit=50', {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!response.ok) {
    console.error('Failed to fetch receipts', await response.text());
    process.exit(1);
  }

  const data = await response.json();
  const receipts = data.receipts || [];

  console.log('--- RECENT TICKETS (Today / Recent) ---');
  let count = 0;
  for (const receipt of receipts) {
    const storeName = storeMap[receipt.store_id] || receipt.store_id;
    if (storeName.toLowerCase().includes('titanio')) {
      console.log(`Titanio Receipt: ${receipt.receipt_number} | At: ${receipt.created_at} | Amount: ${receipt.total_money} | EmployeeID: ${receipt.employee_id} | POS: ${receipt.pos_id}`);
      count++;
    }
  }
  
  if (count === 0) {
      console.log("No Titanio tickets in the last 50 receipts.");
      // let's print the last 5 receipts of ANY store to see if there are tickets today at all
      console.log('\n--- VERY LAST 5 TICKETS (ANY STORE) ---');
      for (let i = 0; i < Math.min(5, receipts.length); i++) {
         const r = receipts[i];
         console.log(`Store: ${storeMap[r.store_id] || r.store_id} | At: ${r.created_at} | Receipt: ${r.receipt_number}`);
      }
  }
  process.exit(0);
}

main().catch(console.error);
