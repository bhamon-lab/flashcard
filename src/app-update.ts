import Constants from 'expo-constants';
import { Alert, Linking, Platform } from 'react-native';

const LATEST_RELEASE_URL = 'https://api.github.com/repos/bhamon-lab/flashcard/releases/latest';
const RELEASES_PAGE_URL = 'https://github.com/bhamon-lab/flashcard/releases';

type GitHubRelease = {
  html_url: string;
  name: string | null;
  tag_name: string;
  assets?: Array<{ name: string; browser_download_url: string }>;
};

type ParsedVersion = {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
};

function parseVersion(version: string): ParsedVersion | null {
  const match = version.trim().match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!match) return null;

  return {
    major: Number(match[1]),
    minor: Number(match[2] ?? 0),
    patch: Number(match[3] ?? 0),
    prerelease: match[4]?.split('.') ?? [],
  };
}

function comparePrerelease(left: string[], right: string[]) {
  if (left.length === 0) return right.length === 0 ? 0 : 1;
  if (right.length === 0) return -1;

  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = left[index];
    const rightPart = right[index];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    if (leftPart === rightPart) continue;

    const leftNumber = /^\d+$/.test(leftPart);
    const rightNumber = /^\d+$/.test(rightPart);
    if (leftNumber && rightNumber) return Number(leftPart) > Number(rightPart) ? 1 : -1;
    if (leftNumber) return -1;
    if (rightNumber) return 1;
    return leftPart > rightPart ? 1 : -1;
  }

  return 0;
}

/** Retourne true seulement si `candidate` est une version SemVer plus récente. */
export function isNewerVersion(candidate: string, current: string) {
  const latest = parseVersion(candidate);
  const installed = parseVersion(current);
  if (!latest || !installed) return false;

  for (const key of ['major', 'minor', 'patch'] as const) {
    if (latest[key] !== installed[key]) return latest[key] > installed[key];
  }

  return comparePrerelease(latest.prerelease, installed.prerelease) > 0;
}

async function getLatestRelease(): Promise<GitHubRelease | null> {
  try {
    const response = await fetch(LATEST_RELEASE_URL, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!response.ok) return null;

    const release: unknown = await response.json();
    if (!release || typeof release !== 'object') return null;

    const candidate = release as Record<string, unknown>;
    if (
      typeof candidate.tag_name !== 'string' ||
      typeof candidate.html_url !== 'string' ||
      (candidate.name !== null && typeof candidate.name !== 'string')
    ) {
      return null;
    }

    const assets = Array.isArray(candidate.assets)
      ? candidate.assets.flatMap((asset) => {
          if (!asset || typeof asset !== 'object') return [];
          const entry = asset as Record<string, unknown>;
          if (typeof entry.name !== 'string' || typeof entry.browser_download_url !== 'string') return [];
          return [{ name: entry.name, browser_download_url: entry.browser_download_url }];
        })
      : undefined;

    return {
      tag_name: candidate.tag_name,
      html_url: candidate.html_url,
      name: candidate.name,
      assets,
    };
  } catch {
    return null;
  }
}

/** Version installée sur mobile ; indéfinie sur web où la PWA est toujours à jour. */
function getInstalledVersion() {
  if (Platform.OS === 'web') return undefined;
  return Constants.expoConfig?.version;
}

/** Vérifie la dernière release GitHub et propose sa page si elle est plus récente (apps natives). */
export async function checkForAppUpdate() {
  if (Platform.OS === 'web') return;
  const currentVersion = getInstalledVersion();
  if (!currentVersion) return;

  const release = await getLatestRelease();
  if (!release || !isNewerVersion(release.tag_name, currentVersion)) return;

  const releaseName = release.name?.trim() || release.tag_name;
  Alert.alert(
    'Mise à jour disponible',
    `Réviz’ ${releaseName} est disponible. Vous utilisez la version ${currentVersion}.`,
    [
      { text: 'Plus tard', style: 'cancel' },
      { text: 'Voir la mise à jour', onPress: () => void Linking.openURL(release.html_url) },
    ],
  );
}

export type WebInstallTarget = 'android-apk' | 'ios-pwa';

/**
 * Plateforme d'installation proposée aux visiteurs de la PWA :
 * Android reçoit l'APK de la release GitHub, iPhone le guide d'installation PWA.
 * Retourne null hors mobile, ou quand la PWA tourne déjà en mode installé.
 */
export function detectWebInstallTarget(): WebInstallTarget | null {
  if (Platform.OS !== 'web') return null;
  if (typeof navigator === 'undefined') return null;

  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: fullscreen)').matches ||
    (navigator as { standalone?: boolean }).standalone === true;
  if (standalone) return null;

  const userAgent = navigator.userAgent ?? '';
  const isAndroid = /android/i.test(userAgent);
  const isIOS = /ipad|iphone|ipod/i.test(userAgent) || (userAgent.includes('Macintosh') && 'ontouchend' in document);
  if (isAndroid) return 'android-apk';
  if (isIOS) return 'ios-pwa';
  return null;
}

/** URL de téléchargement directe de l'APK de la dernière release, sinon la page des releases. */
export async function getLatestApkDownloadUrl(): Promise<string | null> {
  const release = await getLatestRelease();
  if (!release) return RELEASES_PAGE_URL;

  const apk = release.assets?.find((asset) => asset.name.toLowerCase().endsWith('.apk'));
  return apk?.browser_download_url ?? release.html_url;
}
