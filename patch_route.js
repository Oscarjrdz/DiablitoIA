import fs from 'fs';

const target = "/Users/oscar/.gemini/antigravity/brain/62626d89-0a77-463c-94ab-8a96e4ca936b/DIABLITO IA/global-sales-prediction/src/app/api/loyverse/monthly/route.js";
let content = fs.readFileSync(target, 'utf8');

const parallelFunc = `
// 4x time-sliced parallelization to bypass Vercel 10-second timeout bottleneck
async function fetchMonthReceiptsParallel(token, y, m) {
    const startObj = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
    const endObj = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999));
    
    const totalMs = endObj.getTime() - startObj.getTime();
    const sliceMs = Math.floor(totalMs / 4);
    
    const timeSlices = [];
    for (let i = 0; i < 4; i++) {
        const tStart = new Date(startObj.getTime() + (sliceMs * i)).toISOString();
        const tEnd = (i === 3) 
            ? endObj.toISOString() 
            : new Date(startObj.getTime() + (sliceMs * (i + 1)) - 1).toISOString();
        timeSlices.push({ startIso: tStart, endIso: tEnd });
    }
    
    const allChunks = await Promise.all(
        timeSlices.map(slice => fetchMonthReceipts(token, slice.startIso, slice.endIso))
    );
    
    let combinedReceipts = [];
    allChunks.forEach(chunk => { combinedReceipts = combinedReceipts.concat(chunk); });
    return combinedReceipts;
}

export async function GET(req) {`;

content = content.replace("export async function GET(req) {", parallelFunc);

const oldSync = `const startIso = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0)).toISOString();
      const endIso = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999)).toISOString();
      const rawReceipts = await fetchMonthReceipts(token, startIso, endIso);`;
const newSync = `const rawReceipts = await fetchMonthReceiptsParallel(token, y, m);`;
content = content.replace(oldSync, newSync);

const oldCurrent = `const startIso = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0)).toISOString();
            const endIso = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999)).toISOString();
            const rawReceipts = await fetchMonthReceipts(token, startIso, endIso);`;
const newCurrent = `const rawReceipts = await fetchMonthReceiptsParallel(token, y, m);`;
content = content.replace(oldCurrent, newCurrent);

fs.writeFileSync(target, content);
console.log("Patched successfully!");
