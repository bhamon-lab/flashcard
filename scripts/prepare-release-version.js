const fs = require('node:fs');
const path = require('node:path');

const releaseTag = process.argv[2];
const match = releaseTag?.match(/^v?(\d+)\.(\d+)\.(\d+)$/);

if (!match) {
  throw new Error(`Le tag de release doit respecter le format vMAJEUR.MINEUR.CORRECTIF (reçu : ${releaseTag ?? 'absent'}).`);
}

const [, majorString, minorString, patchString] = match;
const major = Number(majorString);
const minor = Number(minorString);
const patch = Number(patchString);
const versionCode = major * 1_000_000 + minor * 1_000 + patch;

if (versionCode > 2_100_000_000) {
  throw new Error(`La version ${releaseTag} produit un versionCode Android invalide.`);
}

const configPath = path.join(__dirname, '..', 'app.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

config.expo.version = `${major}.${minor}.${patch}`;
config.expo.android.versionCode = versionCode;

fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

console.log(`Préparation de Mémento ${config.expo.version} (Android versionCode ${versionCode}).`);
