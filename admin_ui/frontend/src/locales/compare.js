const fs = require('fs');
const en = JSON.parse(fs.readFileSync('en.json', 'utf8'));
const ru = JSON.parse(fs.readFileSync('ru.json', 'utf8'));

let differences = 0;

function compare(o1, o2, path = '') {
    if (!o1 || !o2) return;
    for (const key in o1) {
        if (!(key in o2)) {
            console.log(`Missing in ru: ${path}${key}`);
            differences++;
        } else {
            const t1 = typeof o1[key];
            const t2 = typeof o2[key];
            if (t1 !== t2) {
                console.log(`Type mismatch at ${path}${key} - en: ${t1}, ru: ${t2}`);
                differences++;
            } else if (t1 === 'object' && !Array.isArray(o1[key]) && o1[key] !== null) {
                compare(o1[key], o2[key], path + key + '.');
            }
        }
    }
}

compare(en, ru);

if (differences === 0) {
    console.log("No missing keys or type mismatches found.");
} else {
    console.log(`Found ${differences} issues.`);
}
