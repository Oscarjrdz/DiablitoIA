import { buildPromoText } from './src/lib/folio.js';
// We just want to mock what route.js does.
const STORE_MAP = { '1': 'Bosques', '2': 'Valle de Lincoln', '3': 'San Blas', '4': 'Titanio', '5': 'Palmas', '6': 'Cordillera' };

function parseStore(textMsg, pendingFolio) {
    let isManagerImageFlow = false;
    if (pendingFolio && textMsg) {
        const selNum = textMsg.replace(/\D/g, ''); 
        const selectedStore = STORE_MAP[textMsg] || STORE_MAP[selNum];
        
        if (selectedStore) {
            textMsg = `${pendingFolio} ${selectedStore}`; // Re-inyecta el string
            isManagerImageFlow = true;
        }
    }

    const FOLIO_EXTRACT = /([A-Z]\d{3,4})/i;
    const FOLIO_REGEX = /^[A-Z]\d{3,4}$/i;
    const folioMatch = textMsg.match(FOLIO_EXTRACT) || (FOLIO_REGEX.test(textMsg) ? [textMsg] : null);

    if (folioMatch) {
        let storeFromMsg = '';
        const leftover = textMsg.replace(FOLIO_EXTRACT, '').trim();
        const leftoverUp = leftover.toUpperCase();
        const selNum = leftover.replace(/\D/g, '');
        if (STORE_MAP[selNum]) {
            storeFromMsg = STORE_MAP[selNum];
        } else if (leftoverUp) {
            for (const [key, name] of Object.entries(STORE_MAP)) {
                 const shortName = name.split(' ').pop().toUpperCase(); 
                 if (leftoverUp.includes(shortName) || leftoverUp.includes(name.toUpperCase())) {
                      storeFromMsg = name;
                      break;
                 }
            }
        }
        return storeFromMsg;
    }
    return null;
}

console.log('Sending "2":', parseStore("2", "F666"));
console.log('Sending "5":', parseStore("5", "F666"));
console.log('Sending "F666 2":', parseStore("F666 2", null));

