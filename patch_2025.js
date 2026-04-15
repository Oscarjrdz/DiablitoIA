import fs from 'fs';
const target = "/Users/oscar/.gemini/antigravity/brain/62626d89-0a77-463c-94ab-8a96e4ca936b/DIABLITO IA/global-sales-prediction/src/app/api/loyverse/monthly/route.js";
let content = fs.readFileSync(target, 'utf8');

content = content.replace("for (let y = lastYear; y <= currentYear; y++) {", "for (let y = currentYear; y <= currentYear; y++) {");

fs.writeFileSync(target, content);
console.log("Patched loop to ONLY index 2025!");
