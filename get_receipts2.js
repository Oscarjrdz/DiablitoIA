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

  // Fetch a larger batch of receipts to make sure we cover the whole day
  // 'created_at' in responses are sorted descending by default
  const response = await fetch('https://api.loyverse.com/v1.0/receipts?limit=250', {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!response.ok) {
    console.error('Failed to fetch receipts', await response.text());
    process.exit(1);
  }

  const data = await response.json();
  const receipts = data.receipts || [];

  let titanioTicketsToday = [];
  const todayDateStr = "2026-04-18"; 

  for (const receipt of receipts) {
    const storeName = storeMap[receipt.store_id] || receipt.store_id;
    if (storeName.toLowerCase().includes('titanio')) {
      // Check if ticket is from today (local time in Mexico is -06:00, UTC can be next day but today is definitely the 18th in MX)
      // created_at is UTC like 2026-04-18T19:45:16.000Z
      // Since it's mid-day MX, 2026-04-18 is safe for matching
      if (receipt.created_at.startsWith(todayDateStr)) {
          // Exclude anything that fell into late midnight of the previous business day 
          // Previous shift closed around 06:13 UTC (00:13 local).
          // We only want morning/afternoon tickets.
          const hourUTC = parseInt(receipt.created_at.substring(11, 13), 10);
          if (hourUTC > 10) { // e.g. after 4 AM MX
             titanioTicketsToday.push(receipt);
          }
      }
    }
  }

  if (titanioTicketsToday.length === 0) {
      console.log("No operation tickets found for today after morning close.");
      process.exit(0);
  }

  // Sort ascending by time
  titanioTicketsToday.sort((a,b) => new Date(a.created_at) - new Date(b.created_at));

  const firstTicket = titanioTicketsToday[0];
  const lastTicket = titanioTicketsToday[titanioTicketsToday.length - 1];

  console.log(`--- INFO DE OPERACIÓN TITANIO HOY ---`);
  console.log(`Total de Tickets Hoy: ${titanioTicketsToday.length}`);
  console.log(`Primer ticket (Apertura de facto): ${firstTicket.created_at} (Folio: ${firstTicket.receipt_number}) [Monto: $${firstTicket.total_money}]`);
  console.log(`Último ticket: ${lastTicket.created_at} (Folio: ${lastTicket.receipt_number}) [Monto: $${lastTicket.total_money}]`);
  
  const totalSales = titanioTicketsToday.reduce((acc, obj) => acc + parseFloat(obj.total_money), 0);
  console.log(`Total Venta Hoy: $${totalSales.toFixed(2)}`);

  process.exit(0);
}

main().catch(console.error);
