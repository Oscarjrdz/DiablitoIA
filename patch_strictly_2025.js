import fs from 'fs';
const target = "/Users/oscar/.gemini/antigravity/brain/62626d89-0a77-463c-94ab-8a96e4ca936b/DIABLITO IA/global-sales-prediction/src/app/api/loyverse/monthly/route.js";
let content = fs.readFileSync(target, 'utf8');

const targetStr = `    for (let y = currentYear; y <= currentYear; y++) {
      for (let m = 0; m < 12; m++) {
        if (y === currentYear && m > currentMonthNum) continue;

        tasks.push(async () => {`;

const newStr = `    const TEST_YEAR = 2025;
    for (let y = TEST_YEAR; y <= TEST_YEAR; y++) {
      for (let m = 0; m < 12; m++) {
        // Fix: Use Date to figure out if it's past month
        const todayReal = new Date();
        const yReal = todayReal.getFullYear();
        const mReal = todayReal.getMonth();
        if (y === yReal && m > mReal) continue;

        tasks.push(async () => {`;

content = content.replace(targetStr, newStr);

// Also fix the final loop to display exactly 2025 instead of 'currentYear'
content = content.replace(
  `const cyData = results.find(r => r.year === currentYear && r.month === m);`,
  `const cyData = results.find(r => r.year === 2025 && r.month === m);`
);

content = content.replace(
  `if (cyData && m <= currentMonthNum) { ytdSalesCurrent += cyData.sales; ytdTicketsCurrent += cyData.tickets; }`,
  `if (cyData && m <= new Date().getMonth()) { ytdSalesCurrent += cyData.sales; ytdTicketsCurrent += cyData.tickets; }`
);

fs.writeFileSync(target, content);
console.log("Patched loop strictly to 2025!");
