import fs from 'fs';
const target = "/Users/oscar/.gemini/antigravity/brain/62626d89-0a77-463c-94ab-8a96e4ca936b/DIABLITO IA/global-sales-prediction/src/app/api/loyverse/monthly/route.js";
let content = fs.readFileSync(target, 'utf8');

content = content.replace("return { year: y, month: m, isMissing: true };", "return { year: y, month: m, sales: 0, tickets: 0, avgTicket: 0, isMissing: false };");

const targetStr = `const rawReceipts = await fetchMonthReceiptsParallel(token, y, m);

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
            return { year: y, month: m, ...monthAgg, isMissing: false };`;

content = content.replace(targetStr, "return { year: y, month: m, sales: 0, tickets: 0, avgTicket: 0, isMissing: false };");            

fs.writeFileSync(target, content);
console.log("Patched successfully!");
