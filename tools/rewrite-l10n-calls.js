#!/usr/bin/env node
// Rewrite every t('old.key') / data-t="old.key" in js/ and railmanager.html
// to the new key, using the alias map embedded at the bottom of lang/en.js.
// Idempotent — safe to re-run.

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

// ---------- load alias map from current en.js ----------
let aliases = {};
global.registerLanguage = () => {};
global.registerAliases = (map) => { aliases = map; };
eval(fs.readFileSync(path.join(ROOT, 'lang/en.js'), 'utf8'));
const aliasCount = Object.keys(aliases).length;
console.error(`loaded ${aliasCount} aliases`);
if (!aliasCount) {
  console.error('no aliases — step 2a may not have run, or 2c already removed them');
  process.exit(1);
}

// ---------- walk files ----------
function listFiles(dir, matcher) {
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) out.push(...listFiles(p, matcher));
    else if (matcher(p)) out.push(p);
  }
  return out;
}
const targets = [
  ...listFiles(path.join(ROOT, 'js'), p => p.endsWith('.js')),
  path.join(ROOT, 'railmanager.html'),
];

// ---------- rewrite ----------
// Replacement patterns (order matters — handle attribute forms before free t()):
//   data-t="OLD"              → data-t="NEW"
//   data-t-title="OLD"        → data-t-title="NEW"
//   data-t-placeholder="OLD"  → data-t-placeholder="NEW"
//   t('OLD', ...)  / t("OLD", ...)   → t('NEW', ...)
// Note: keys only contain [a-zA-Z0-9_.], so regex escaping is trivial.
const PATTERNS = [
  { name: 'data-t',             re: /data-t="([a-zA-Z_][a-zA-Z0-9_.]*)"/g,             build: k => `data-t="${k}"` },
  { name: 'data-t-title',       re: /data-t-title="([a-zA-Z_][a-zA-Z0-9_.]*)"/g,       build: k => `data-t-title="${k}"` },
  { name: 'data-t-placeholder', re: /data-t-placeholder="([a-zA-Z_][a-zA-Z0-9_.]*)"/g, build: k => `data-t-placeholder="${k}"` },
  { name: "t('…')",  re: /\bt\('([a-zA-Z_][a-zA-Z0-9_.]*)'/g,  build: k => `t('${k}'` },
  { name: 't("…")',  re: /\bt\("([a-zA-Z_][a-zA-Z0-9_.]*)"/g,  build: k => `t("${k}"` },
];

let totalFiles = 0;
let totalReplacements = 0;
const perKey = {};
for (const file of targets) {
  let src = fs.readFileSync(file, 'utf8');
  let fileChanged = 0;
  for (const pat of PATTERNS) {
    src = src.replace(pat.re, (match, key) => {
      const newKey = aliases[key];
      if (!newKey || newKey === key) return match;
      fileChanged++;
      perKey[key] = (perKey[key] || 0) + 1;
      return pat.build(newKey);
    });
  }
  if (fileChanged) {
    fs.writeFileSync(file, src);
    console.error(`  ${path.relative(ROOT, file)}: ${fileChanged} replacements`);
    totalFiles++;
    totalReplacements += fileChanged;
  }
}
console.error(`\n${totalReplacements} replacements across ${totalFiles} files`);
console.error(`unique old keys replaced: ${Object.keys(perKey).length}`);

// Show any aliases that weren't touched — they probably refer to keys that
// are dynamically built (t('prefix.' + var)) or already absent from source.
const unused = Object.keys(aliases).filter(k => !(k in perKey));
if (unused.length) {
  console.error(`\nunused aliases (${unused.length}):`);
  for (const k of unused.slice(0, 30)) console.error('  ' + k);
  if (unused.length > 30) console.error(`  ... and ${unused.length - 30} more`);
}
