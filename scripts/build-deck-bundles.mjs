#!/usr/bin/env node
// Génère un bundle compact par matière : decks/<matiere>/_bundle.json
// (et decks/_bundle.json pour les fichiers .json à plat à la racine).
// Chaque entrée embarque le SHA git du fichier source pour permettre la
// synchronisation incrémentale côté app (ne télécharger que le nouveau).
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DECKS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'decks');
const BUNDLE_NAME = '_bundle.json';

/** SHA git d'un blob (= champ `sha` renvoyé par l'API Contents de GitHub). */
function blobSha(buffer) {
  return createHash('sha1').update(`blob ${buffer.length}\0`).update(buffer).digest('hex');
}

async function buildBundle(dirPath, dirName) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files = [];
  let sourceBytes = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) continue;
    if (entry.name === BUNDLE_NAME || entry.name.startsWith('_')) continue;
    const buffer = await readFile(path.join(dirPath, entry.name));
    let raw;
    try {
      raw = JSON.parse(buffer.toString('utf8'));
    } catch {
      console.warn(`⚠ ${dirName}/${entry.name} : JSON illisible, ignoré`);
      continue;
    }
    sourceBytes += buffer.length;
    files.push({ file: entry.name, sha: blobSha(buffer), raw });
  }
  if (!files.length) return null;
  const bundlePath = path.join(dirPath, BUNDLE_NAME);
  const content = JSON.stringify({ files });
  const existing = await readFile(bundlePath, 'utf8').catch(() => null);
  if (existing !== content) await writeFile(bundlePath, content);
  return { dirName, count: files.length, sourceBytes, bundleBytes: Buffer.byteLength(content), changed: existing !== content };
}

const results = [];
const rootFiles = [];
for (const entry of await readdir(DECKS_DIR, { withFileTypes: true })) {
  if (entry.isDirectory()) {
    const result = await buildBundle(path.join(DECKS_DIR, entry.name), entry.name);
    if (result) results.push(result);
  } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json') && entry.name !== BUNDLE_NAME && !entry.name.startsWith('_')) {
    rootFiles.push(entry.name);
  }
}
if (rootFiles.length) {
  const result = await buildBundle(DECKS_DIR, '(racine)');
  if (result) results.push(result);
}

let total = 0;
for (const r of results) {
  total += r.count;
  console.log(`${r.changed ? '✓' : '='} ${r.dirName}: ${r.count} decks, bundle ${(r.bundleBytes / 1024).toFixed(0)} Ko (source ${(r.sourceBytes / 1024).toFixed(0)} Ko)`);
}
console.log(`${total} decks empaquetés dans ${results.length} bundle(s).`);
