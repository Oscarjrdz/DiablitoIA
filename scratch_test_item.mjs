import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.test' });

async function run() {
  const redis = new Redis(process.env.REDIS_URL);
  const token = await redis.get('loyverse_token');
  
  const targetStoreId = "ad5b877f-e044-40cc-974b-208cf49440d0"; // Garcia
  
  const res = await fetch('https://api.loyverse.com/v1.0/stores', {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  const allStores = data.stores || [];
  
  const folio = "TEST" + Math.floor(Math.random() * 1000);
  const itemName = "Burger Gratis " + folio;
  
  const storePrices = allStores.map(s => ({
    store_id: s.id,
    pricing_type: 'FIXED',
    price: 0,
    available_for_sale: s.id === targetStoreId
  }));

  const payload = {
    item_name: itemName,
    reference_id: `coupon-${folio.toLowerCase()}`,
    category_id: 'f13c261b-1c35-4f17-8cc6-d7dcce5c94b0',
    sold_by_weight: false,
    variants: [{
      variant_name: 'Default',
      sku: folio.toUpperCase(),
      cost: 0,
      default_pricing_type: 'FIXED',
      default_price: 0,
      stores: storePrices
    }]
  };

  const req = await fetch('https://api.loyverse.com/v1.0/items', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const respData = await req.json();
  console.log('Result ok:', req.ok);
  console.log('Data:', JSON.stringify(respData, null, 2));
  
  if (req.ok && respData.id) {
     await fetch(`https://api.loyverse.com/v1.0/items/${respData.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
     });
     console.log('Deleted test item');
  }
  
  process.exit(0);
}
run();
