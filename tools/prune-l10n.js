#!/usr/bin/env node
// Remove the dead keys listed in the argument file from lang/en.js and lang/hs.js.
// Also prunes the matching entries from hs.js's _hashes block.
// Usage: node tools/prune-l10n.js <dead-keys-file>

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

const deadFile = process.argv[2];
if (!deadFile) { console.error('usage: node tools/prune-l10n.js <dead-keys-file>'); process.exit(1); }
const dead = new Set(fs.readFileSync(deadFile, 'utf8').trim().split('\n').filter(Boolean));
console.error(`pruning ${dead.size} keys`);

// Load current en + hs
const captured = {};
global.registerLanguage = (code, name, strings) => { captured[code] = { name, strings }; };
global.registerAliases = () => {};
eval(fs.readFileSync(path.join(ROOT, 'lang/en.js'), 'utf8'));
eval(fs.readFileSync(path.join(ROOT, 'lang/hs.js'), 'utf8'));

function flatten(obj, prefix, out) {
  out = out || {};
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith('_')) continue;
    const full = prefix ? prefix + '.' + k : k;
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) flatten(v, full, out);
    else out[full] = v;
  }
  return out;
}
function unflatten(flat) {
  const out = {};
  for (const [key, val] of Object.entries(flat)) {
    const parts = key.split('.');
    let cur = out;
    for (let i = 0; i < parts.length - 1; i++) {
      cur[parts[i]] = cur[parts[i]] || {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = val;
  }
  return out;
}

// Prune en
const enFlat = flatten(captured.en.strings);
const enKeep = {};
let enDropped = 0;
for (const [k, v] of Object.entries(enFlat)) {
  if (dead.has(k)) { enDropped++; continue; }
  enKeep[k] = v;
}

// Prune hs + its hashes. hs might not contain every dead key (if not translated),
// but for any it does have, drop it + its hash entry.
const hsFlat = flatten(captured.hs.strings);
const hsHashes = captured.hs.strings._hashes || {};
const hsKeep = {};
const hsKeepHashes = {};
let hsDropped = 0, hashDropped = 0;
for (const [k, v] of Object.entries(hsFlat)) {
  if (dead.has(k)) { hsDropped++; continue; }
  hsKeep[k] = v;
}
for (const [k, h] of Object.entries(hsHashes)) {
  if (dead.has(k)) { hashDropped++; continue; }
  hsKeepHashes[k] = h;
}

console.error(`en.js: dropped ${enDropped} keys (${Object.keys(enKeep).length} remain)`);
console.error(`hs.js: dropped ${hsDropped} keys + ${hashDropped} hash entries (${Object.keys(hsKeep).length} remain)`);

// Write en.js
const enBody = JSON.stringify(unflatten(enKeep), null, 2);
const enHeader = `// English — default language
// To create a new language: copy this file, rename it (e.g. mycustomlang.js),
// change the registerLanguage call, translate the strings, and add a <script> tag
// in railmanager.html before the init block.
`;
fs.writeFileSync(path.join(ROOT, 'lang/en.js'),
  enHeader + `registerLanguage('en', 'English', ${enBody});\n`);

// Write hs.js with _hashes block spliced in at the bottom of the object
const hsBody = JSON.stringify(unflatten(hsKeep), null, 2);
const hashLines = Object.keys(hsKeepHashes).sort()
  .map(k => `    ${JSON.stringify(k)}: ${JSON.stringify(hsKeepHashes[k])}`)
  .join(',\n');
const hsBodyWithHashes = hsBody.replace(/\n\}$/, `,\n  "_hashes": {\n${hashLines}\n  }\n}`);
const hsHeader = `// Hemsteiner
// To create a new language: copy this file, rename it (e.g. mycustomlang.js),
// change the registerLanguage call, translate the strings, and add a <script> tag
// in railmanager.html before the init block.
`;
fs.writeFileSync(path.join(ROOT, 'lang/hs.js'),
  hsHeader + `registerLanguage('hs', 'Hemsteiner', ${hsBodyWithHashes});\n`);

console.error('wrote lang/en.js and lang/hs.js');
