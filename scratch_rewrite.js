const STORE_MAP = { '1': 'Bosques', '2': 'Valle de Lincoln', '3': 'San Blas', '4': 'Titanio', '5': 'Palmas', '6': 'Cordillera' };

let textMsg = "F123 Valle de Lincoln";
const FOLIO_EXTRACT = /([A-Z]\d{3,4})/i;

let storeFromMsg = '';
const leftover = textMsg.replace(FOLIO_EXTRACT, '').trim();
const leftoverUp = leftover.toUpperCase();

// EXACT match in values:
const exactMatch = Object.values(STORE_MAP).find(v => leftoverUp.includes(v.toUpperCase()));
if (exactMatch) {
    storeFromMsg = exactMatch;
} else {
    // Number match:
    const selNum = leftover.replace(/\D/g, '');
    if (STORE_MAP[selNum]) {
        storeFromMsg = STORE_MAP[selNum];
    } else {
        // Keyword match:
        for (const [key, name] of Object.entries(STORE_MAP)) {
            const shortName = name.split(' ').pop().toUpperCase(); 
            if (leftoverUp.includes(shortName)) {
                storeFromMsg = name;
                break;
            }
        }
    }
}
console.log("storeFromMsg:", storeFromMsg);
