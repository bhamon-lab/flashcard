import Constants from 'expo-constants';
import { Alert, Linking } from 'react-native';

const LATEST_RELEASE_URL = 'https://api.github.com/repos/hamon-e/flashcard/releases/latest';

type GitHubRelease = {
  html_url: string;
  name: string | null;
  tag_name: string;
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

    return {
      tag_name: candidate.tag_name,
      html_url: candidate.html_url,
      name: candidate.name,
    };
  } catch {
    return null;
  }
}

/** Vérifie la dernière release GitHub et propose sa page si elle est plus récente. */
export async function checkForAppUpdate() {
  const currentVersion = Constants.expoConfig?.version;
  if (!currentVersion) return;

  const release = await getLatestRelease();
  if (!release || !isNewerVersion(release.tag_name, currentVersion)) return;

  const releaseName = release.name?.trim() || release.tag_name;
  Alert.alert(
    'Mise à jour disponible',
    `Mémento ${releaseName} est disponible. Vous utilisez la version ${currentVersion}.`,
    [
      { text: 'Plus tard', style: 'cancel' },
      { text: 'Voir la mise à jour', onPress: () => void Linking.openURL(release.html_url) },
    ],
  );
}
