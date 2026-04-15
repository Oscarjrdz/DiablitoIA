const DIAS = ['DOMINGO','LUNES','MARTES','MIÉRCOLES','JUEVES','VIERNES','SÁBADO'];
const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];

export function generateFolio() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const nums = '0123456789';
  let code = letters[Math.floor(Math.random() * letters.length)];
  for (let i = 0; i < 4; i++) code += nums[Math.floor(Math.random() * nums.length)];
  return code;
}

export function buildPromoText(baseText, folio, validFrom = 'hoy', validityDuration = 1) {
  // Calculate "today" in Mexico City time (CST = UTC-6)
  const nowUTC = new Date();
  const mexicoOffsetMs = -6 * 60 * 60 * 1000;
  const mexicoNow = new Date(nowUTC.getTime() + mexicoOffsetMs);
  
  // start date
  const startDate = new Date(mexicoNow.getTime());
  if (validFrom === 'mañana') {
    startDate.setTime(startDate.getTime() + 24 * 60 * 60 * 1000);
  }

  // end date
  const durationInDays = parseInt(validityDuration, 10) || 1;
  const endDate = new Date(startDate.getTime() + (durationInDays - 1) * 24 * 60 * 60 * 1000);

  const startDiaNombre = DIAS[startDate.getUTCDay()];
  const startDiaNum = startDate.getUTCDate();
  const startMesNombre = MESES[startDate.getUTCMonth()];
  
  const endDiaNombre = DIAS[endDate.getUTCDay()];
  const endDiaNum = endDate.getUTCDate();
  const endMesNombre = MESES[endDate.getUTCMonth()];
  const endYear = endDate.getUTCFullYear();

  let text;
  if (durationInDays === 1) {
    // Only valid on one specific day
    text = `${baseText}\n\n🎟️ *Tu folio es: ${folio}*\n⏰ Válido solo el ${startDiaNombre} ${startDiaNum} DE ${startMesNombre} ${startDate.getUTCFullYear()}`;
  } else {
    // Valid for a range
    text = `${baseText}\n\n🎟️ *Tu folio es: ${folio}*\n⏰ Válido del ${startDiaNombre} ${startDiaNum} DE ${startMesNombre} al ${endDiaNombre} ${endDiaNum} DE ${endMesNombre} ${endYear}`;
  }

  // Save both start and end date for proper validation
  const startYear = startDate.getUTCFullYear();
  const startStr = `${startYear}-${String(startDate.getUTCMonth() + 1).padStart(2, '0')}-${String(startDiaNum).padStart(2, '0')}`;
  const endStr = `${endYear}-${String(endDate.getUTCMonth() + 1).padStart(2, '0')}-${String(endDiaNum).padStart(2, '0')}`;
  const validDate = `${startStr}|${endStr}`;

  return { text, validDate };
}
