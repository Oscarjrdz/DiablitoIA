const STORE_MAP = { '1': 'Bosques', '2': 'Valle de Lincoln', '3': 'San Blas', '4': 'Titanio', '5': 'Palmas', '6': 'Cordillera' };
let textMsg = "F123 2";

const FOLIO_EXTRACT = /([A-Z]\d{3,4})/i;
const FOLIO_REGEX = /^[A-Z]\d{3,4}$/i;
const folioMatch = textMsg.match(FOLIO_EXTRACT) || (FOLIO_REGEX.test(textMsg) ? [textMsg] : null);

let storeFromMsg = '';
const leftover = textMsg.replace(FOLIO_EXTRACT, '').trim();
const leftoverUp = leftover.toUpperCase();
const selNum2 = leftover.replace(/\D/g, '');
if (STORE_MAP[selNum2]) {
    storeFromMsg = STORE_MAP[selNum2];
} else if (leftoverUp) {
    for (const [key, name] of Object.entries(STORE_MAP)) {
         const shortName = name.split(' ').pop().toUpperCase(); 
         if (leftoverUp.includes(shortName) || leftoverUp.includes(name.toUpperCase())) {
              storeFromMsg = name;
              break;
         }
    }
}
console.log("textMsg:", textMsg);
console.log("leftover:", leftover);
console.log("selNum2:", selNum2);
console.log("storeFromMsg:", storeFromMsg);

