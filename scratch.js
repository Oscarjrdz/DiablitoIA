const fs = require('fs');
let css = fs.readFileSync('src/app/clients/page.module.css', 'utf8');

css = css.replace("max-width: 1400px;", "max-width: 98%; overflow-x: auto;");

fs.writeFileSync('src/app/clients/page.module.css', css);
