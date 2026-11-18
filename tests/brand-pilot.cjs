const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const brandValues = [...app.matchAll(/homeTitle:\s*'([^']+)'/g)].map(match => match[1]);

assert.deepStrictEqual(brandValues, ['Billiard City', 'Billiard City', 'Billiard City']);
assert.match(html, /id="home-title"[^>]*>Billiard City<\/h1>/);
console.log('Brand pilot passed: the homepage brand is exactly Billiard City in UK, RU and EN fallback copy.');
