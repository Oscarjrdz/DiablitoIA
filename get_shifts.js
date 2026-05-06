const Redis = require('ioredis');

async function main() {
  const redis = new Redis('redis://default:doyoQnFFAlJoxrhkc3KrRxL1awfSlSjr@redis-18769.c270.us-east-1-3.ec2.cloud.redislabs.com:18769');
  
  const token = await redis.get('loyverse_token');
  if (!token) {
    console.error('No loyverse_token in redis');
    process.exit(1);
  }

  // Get shifts from loyverse
  const response = await fetch('https://api.loyverse.com/v1.0/shifts?limit=250', {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!response.ok) {
    console.error('Failed to fetch shifts', await response.text());
    process.exit(1);
  }

  const data = await response.json();
  const shifts = data.shifts || [];

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

  console.log('--- ALL TITANIO SHIFTS ---');
  let count = 0;
  for (const shift of shifts) {
    const sname = storeMap[shift.store_id] || shift.store_id;
    if (sname.toLowerCase().includes('titanio')) {
      console.log(`Store: ${sname} | Opened: ${shift.opened_at} | Closed: ${shift.closed_at || 'STILL OPEN'}`);
      count++;
      if (count > 5) break; 
    }
  }
  
  process.exit(0);
}

main().catch(console.error);
