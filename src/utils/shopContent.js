// Gemeinsame Helfer fuer /srv/docker/gas-webshop/shop-content (gasshop #281, #285).
// Der Ordner ist read-only unter /content/ im Shop eingehaengt und nicht in Git:
// Aenderungen wirken sofort, ohne Rebuild.
const fs = require('fs');
const path = require('path');

const CONTENT_DIR = process.env.SHOP_CONTENT_DIR || '/srv/docker/gas-webshop/shop-content';
const CONFIG_PATH = path.join(CONTENT_DIR, 'shop-config.json');
const IMG_DIR = path.join(CONTENT_DIR, 'img');

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

// Atomar schreiben, damit nginx nie eine halbe Datei ausliefert
function writeAtomic(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}

// CMS-Datei lesen, aendern, atomar zurueckschreiben
function updateCmsConfig(mutate) {
  const cfg = readJson(CONFIG_PATH) || {};
  mutate(cfg);
  writeAtomic(CONFIG_PATH, JSON.stringify(cfg, null, 2) + '\n');
  return cfg;
}

module.exports = { CONTENT_DIR, CONFIG_PATH, IMG_DIR, readJson, writeAtomic, updateCmsConfig };
