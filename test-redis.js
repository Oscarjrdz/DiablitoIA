const { redis } = require('./src/lib/redis');
async function run() {
  const gId = await redis.get('ventas_grupo_id');
  console.log("Grupo ID:", gId);
  const clean = '52' + gId.replace(/\D/g, '').slice(-10);
  const hist = await redis.get(`chat_hist_${clean}@c.us`);
  console.log(hist ? hist.substring(hist.length - 500) : "No history");
}
run();
