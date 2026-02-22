/**
 * Fix locale file structure.
 * 
 * Problem: `advanced`, `system`, `common`, `mcp`, `terminal`, and `updates`
 * are currently nested inside the `wizard` key, but the code expects them
 * as top-level keys (e.g., t('terminal.welcome'), t('advanced.bargeIn.title')).
 * 
 * This script promotes those keys to be siblings of `wizard` instead of children.
 */
const fs = require('fs');
const path = require('path');

const KEYS_TO_PROMOTE = ['advanced', 'system', 'common', 'mcp', 'terminal', 'updates'];

function fixLocale(filePath) {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);

    if (!data.wizard) {
        console.log(`  [SKIP] No "wizard" key found in ${path.basename(filePath)}`);
        return;
    }

    let promoted = 0;
    for (const key of KEYS_TO_PROMOTE) {
        if (data.wizard[key] !== undefined) {
            if (data[key] !== undefined) {
                console.log(`  [WARN] Top-level "${key}" already exists in ${path.basename(filePath)}! Merging wizard.${key} INTO top-level ${key}.`);
                // Merge: top-level wins for conflicts, wizard adds missing keys
                data[key] = { ...data.wizard[key], ...data[key] };
            } else {
                data[key] = data.wizard[key];
            }
            delete data.wizard[key];
            promoted++;
            console.log(`  [OK] Promoted "${key}" to top level`);
        }
    }

    if (promoted === 0) {
        console.log(`  [SKIP] No keys to promote in ${path.basename(filePath)}`);
        return;
    }

    // Write back with 4-space indentation
    const output = JSON.stringify(data, null, 4);
    fs.writeFileSync(filePath, output, 'utf-8');
    console.log(`  [DONE] ${path.basename(filePath)}: promoted ${promoted} keys. File saved.`);
}

const localesDir = path.join(__dirname, 'src', 'locales');
console.log('Fixing locale file structure...\n');

console.log('Processing en.json:');
fixLocale(path.join(localesDir, 'en.json'));

console.log('\nProcessing ru.json:');
fixLocale(path.join(localesDir, 'ru.json'));

console.log('\nDone! Verify the app still works correctly.');
