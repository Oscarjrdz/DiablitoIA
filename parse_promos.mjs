import fs from 'fs';
const p = JSON.parse(fs.readFileSync('promos.json', 'utf8'));
const simplePromos = p.map(promo => {
  const { image, ...rest } = promo;
  return rest;
});
console.log(JSON.stringify(simplePromos, null, 2));
