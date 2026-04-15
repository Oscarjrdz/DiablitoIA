import fs from 'fs';
const target = "/Users/oscar/.gemini/antigravity/brain/62626d89-0a77-463c-94ab-8a96e4ca936b/DIABLITO IA/global-sales-prediction/src/app/api/loyverse/monthly/route.js";
let content = fs.readFileSync(target, 'utf8');

const targetStr = `          if (isCompletedMonth) {
            // Missing historical! Tell frontend to sync it later.
            return { year: y, month: m, isMissing: true };
          } else {
            // Current month active: fetch live using 4x parallel speed
            const rawReceipts = await fetchMonthReceiptsParallel(token, y, m);

            let sales = 0; let tickets = 0;
            rawReceipts.forEach(r => {
              if (storeId !== 'all' && r.store_id !== storeId) return;
              if (r.cancelled_at || r.receipt_type === 'REFUND') return;
              sales += (Math.abs(r.total_money || 0) + Math.abs(r.total_discount || 0));
              tickets++;
            });
            const avgTicket = tickets > 0 ? (sales / tickets) : 0;
            const monthAgg = { sales, tickets, avgTicket };
            
            await redis.setex(cacheKey, 3600, JSON.stringify(monthAgg)); // 1 hr
            return { year: y, month: m, ...monthAgg, isMissing: false };
          }`;

const newStr = `          // Extractions disabled by user request. Returning 0 for anything not cached.
          return { year: y, month: m, sales: 0, tickets: 0, avgTicket: 0, isMissing: false };`;

content = content.replace(targetStr, newStr);

// Restore 2024 to the loop logic so the UI shows both years, but from cache only
content = content.replace(
  `const TEST_YEAR = 2025;
    for (let y = TEST_YEAR; y <= TEST_YEAR; y++) {`,
  `for (let y = lastYear; y <= currentYear; y++) {`
);

content = content.replace(
  `// Fix: Use Date to figure out if it's past month
        const todayReal = new Date();
        const yReal = todayReal.getFullYear();
        const mReal = todayReal.getMonth();
        if (y === yReal && m > mReal) continue;`,
  `if (y === currentYear && m > currentMonthNum) continue;`
);

content = content.replace(
  `const cyData = results.find(r => r.year === 2025 && r.month === m);`,
  `const cyData = results.find(r => r.year === currentYear && r.month === m);`
);

content = content.replace(
  `if (cyData && m <= new Date().getMonth()) { ytdSalesCurrent += cyData.sales; ytdTicketsCurrent += cyData.tickets; }`,
  `if (cyData && m <= currentMonthNum) { ytdSalesCurrent += cyData.sales; ytdTicketsCurrent += cyData.tickets; }`
);

fs.writeFileSync(target, content);
console.log("Patched loop strictly to CACHE-ONLY mode!");
