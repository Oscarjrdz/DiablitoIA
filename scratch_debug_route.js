const STORE_MAP = { '1': 'Bosques', '2': 'Valle de Lincoln', '3': 'San Blas', '4': 'Titanio', '5': 'Palmas', '6': 'Cordillera' };

async function simulate(textMsgRaw, pendingFolio) {
    let cleanPhoneGlobal = "521234567890";
    let textMsg = textMsgRaw;
    let isManagerImageFlow = false;
    
    if (pendingFolio && textMsg) {
        const selNum = textMsg.replace(/\D/g, ''); 
        const selectedStore = STORE_MAP[textMsg] || STORE_MAP[selNum];
        
        if (selectedStore) {
            textMsg = `${pendingFolio} ${selectedStore}`; 
            isManagerImageFlow = true;
        } else {
             return '⚠️ Opción no válida.';
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
        
        return `SUCCESS: ${storeFromMsg}`;
    }
    return "NO FOLIO MATCH";
}

console.log(simulate("2", "F666"));
console.log(simulate("1", "F666"));
