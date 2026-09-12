import { Directory, File, Paths } from 'expo-file-system';
import JSZip from 'jszip';
import { Platform } from 'react-native';

export type PreparedImport = {
  csvText: string;
  photoUris: Record<string, string>;
};

const imageMime = (name: string) => {
  const extension = name.split('.').pop()?.toLowerCase();
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  return 'image/jpeg';
};

const baseName = (path: string) => path.split('/').pop() ?? path;

const isZipContent = (bytes: Uint8Array) =>
  bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b &&
  (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07) &&
  (bytes[3] === 0x04 || bytes[3] === 0x06 || bytes[3] === 0x08);

function ensureCsvText(csvText: string) {
  if (!csvText.trim()) throw new Error('Le fichier est vide. Choisis un CSV contenant au moins une ligne.');

  // A binary file incorrectly labelled as a CSV would otherwise leave the import
  // screen in an unusable state without explaining what happened.
  if (/[\u0000-\u0008\u000E-\u001F]/.test(csvText)) {
    throw new Error('Ce fichier n’est ni un CSV lisible ni une archive ZIP. Télécharge à nouveau le ZIP depuis Google Drive puis sélectionne-le.');
  }
}

export async function prepareImport(uri: string, fileName: string): Promise<PreparedImport> {
  let bytes: Uint8Array;
  try {
    // The modern File API reads the cached file directly as bytes. This avoids
    // putting a (potentially large) ZIP through the legacy base64 bridge.
    bytes = await new File(uri).bytes();
  } catch (fileSystemError) {
    try {
      // Expo Go on Android can put DocumentPicker files in its global cache,
      // outside the experience-scoped paths accepted by expo-file-system.
      // React Native's URI loader can still read that picker-owned file.
      const response = await fetch(uri);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      bytes = new Uint8Array(await response.arrayBuffer());
    } catch (uriError) {
      console.error('[prepareImport] Unable to read selected file', { uri, fileSystemError, uriError });
      throw new Error('Le fichier sélectionné ne peut pas être lu. Vérifie qu’il est entièrement téléchargé dans Fichiers, puis réessaie.');
    }
  }

  // Google Drive and some Android file providers expose downloaded ZIP files as
  // application/octet-stream and may omit the .zip suffix. Detect the archive
  // from its signature instead of trusting the provider's filename.
  if (!fileName.toLowerCase().endsWith('.zip') && !isZipContent(bytes)) {
    const csvText = new TextDecoder('utf-8').decode(bytes);
    ensureCsvText(csvText);
    return { csvText, photoUris: {} };
  }

  let archive: JSZip;
  try {
    archive = await JSZip.loadAsync(bytes);
  } catch {
    throw new Error('Cette archive ZIP est endommagée ou incomplète. Télécharge-la à nouveau depuis Google Drive avant de l’importer.');
  }
  const entries = Object.values(archive.files).filter((entry) => !entry.dir);
  const csvEntry = entries.find((entry) => entry.name.toLowerCase().endsWith('.csv'));
  if (!csvEntry) throw new Error('Cette archive ne contient aucun fichier CSV.');

  const csvText = await csvEntry.async('string');
  ensureCsvText(csvText);
  const photoUris: Record<string, string> = {};
  const images = entries.filter((entry) => /\.(jpe?g|png|webp)$/i.test(entry.name));
  const destinationDirectory = new Directory(Paths.document, 'imports', String(Date.now()));
  if (Platform.OS !== 'web') destinationDirectory.create({ intermediates: true, idempotent: true });

  for (let index = 0; index < images.length; index += 1) {
    const entry = images[index];
    const name = baseName(entry.name);
    const content = await entry.async(Platform.OS === 'web' ? 'base64' : 'uint8array');
    let destination: string;
    if (Platform.OS === 'web') {
      destination = `data:${imageMime(name)};base64,${content as string}`;
    } else {
      const extension = name.split('.').pop()?.toLowerCase() || 'jpg';
      const file = new File(destinationDirectory, `${index}.${extension}`);
      file.write(content as Uint8Array);
      destination = file.uri;
    }
    photoUris[name] = destination;
    photoUris[entry.name] = destination;
  }

  return { csvText, photoUris };
}
