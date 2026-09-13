import Constants from 'expo-constants';
import { removeDecksNotIn, setMetadata, upsertSyncedDeck, type SyncedDeck } from './db';

const DEFAULT_REPO = 'bhamon-lab/flashcard';
const DECKS_PATH = 'decks';
const LAST_SYNC_KEY = 'decks-last-sync';

export type SyncResult = {
  created: number;
  updated: number;
  removed: number;
  total: number;
  errors: string[];
};

type GitHubContent = {
  name: string;
  type: string;
  path: string;
  download_url: string | null;
};

function repoIdentifier(): string {
  const extra = Constants.expoConfig?.extra as { decksRepo?: string } | undefined;
  return extra?.decksRepo ?? DEFAULT_REPO;
}

function slugify(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9-_]+/g, '-');
}

/** Nom de matière affiché à partir du nom de dossier (« maths » → « Maths »). */
function subjectFromFolder(folderName: string) {
  const cleaned = folderName.replace(/[-_]+/g, ' ').trim();
  if (!cleaned) return 'Divers';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/** Valide et normalise un deck JSON brut du dépôt. */
function asDeck(raw: unknown, fileName: string, fallbackSubject: string): SyncedDeck | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Record<string, unknown>;
  const title = typeof candidate.title === 'string' ? candidate.title.trim() : '';
  if (!title) return null;
  const fallbackId = slugify(fileName.replace(/\.json$/i, ''));
  const id = typeof candidate.id === 'string' && candidate.id.trim() ? slugify(candidate.id) : fallbackId;
  if (!id) return null;
  const cards = Array.isArray(candidate.cards) ? candidate.cards : [];
  const normalized: SyncedDeck['cards'] = [];
  cards.forEach((rawCard, index) => {
    if (!rawCard || typeof rawCard !== 'object') return;
    const card = rawCard as Record<string, unknown>;
    const front = typeof card.front === 'string' ? card.front.trim() : '';
    if (!front) return;
    const cardId = typeof card.id === 'string' && card.id.trim() ? slugify(card.id) : `carte-${index + 1}`;
    normalized.push({
      id: cardId,
      front,
      back: typeof card.back === 'string' ? card.back.trim() : '',
    });
  });
  if (!normalized.length) return null;
  const subject = typeof candidate.subject === 'string' && candidate.subject.trim() ? candidate.subject.trim() : fallbackSubject;
  const grade = typeof candidate.grade === 'string' && candidate.grade.trim() ? candidate.grade.trim() : undefined;
  return {
    id,
    title,
    subject,
    grade,
    description: typeof candidate.description === 'string' ? candidate.description.trim() : '',
    color: typeof candidate.color === 'string' ? candidate.color : undefined,
    format: candidate.format === 'math' ? 'math' : 'people',
    daily_new_limit: typeof candidate.daily_new_limit === 'number' ? candidate.daily_new_limit : undefined,
    cards: normalized,
  };
}

async function listGithubContents(path: string): Promise<GitHubContent[]> {
  const repo = repoIdentifier();
  const response = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!response.ok) {
    if (response.status === 404) throw new Error(`Dossier « ${path}/ » introuvable dans ${repo}.`);
    throw new Error(`GitHub a répondu ${response.status}.`);
  }
  const entries = (await response.json()) as GitHubContent[];
  if (!Array.isArray(entries)) throw new Error('Réponse GitHub inattendue.');
  return entries;
}

async function fetchDeckFile(
  entry: GitHubContent,
  fallbackSubject: string,
  decks: SyncedDeck[],
  errors: string[],
): Promise<void> {
  if (entry.type !== 'file' || !entry.name.toLowerCase().endsWith('.json')) return;
  if (!entry.download_url) {
    errors.push(`${entry.name} : URL de téléchargement indisponible.`);
    return;
  }
  try {
    const fileResponse = await fetch(entry.download_url);
    if (!fileResponse.ok) throw new Error(`HTTP ${fileResponse.status}`);
    const deck = asDeck(await fileResponse.json(), entry.name, fallbackSubject);
    if (deck) decks.push(deck);
    else errors.push(`${entry.name} : format invalide (title et cards avec front requis).`);
  } catch (error) {
    errors.push(`${entry.name} : ${error instanceof Error ? error.message : 'illisible'}`);
  }
}

async function fetchRepoDecks(): Promise<{ decks: SyncedDeck[]; errors: string[] }> {
  const errors: string[] = [];
  const decks: SyncedDeck[] = [];
  const entries = await listGithubContents(DECKS_PATH);
  for (const entry of entries) {
    if (entry.type === 'dir') {
      try {
        const subjectFiles = await listGithubContents(entry.path);
        for (const file of subjectFiles) {
          await fetchDeckFile(file, subjectFromFolder(entry.name), decks, errors);
        }
      } catch (error) {
        errors.push(`${entry.name}/ : ${error instanceof Error ? error.message : 'illisible'}`);
      }
    } else {
      // Ancienne organisation à plat : paquets sans dossier de matière.
      await fetchDeckFile(entry, 'Divers', decks, errors);
    }
  }
  return { decks, errors };
}

/**
 * Synchronise les decks du dossier `decks/` du dépôt GitHub vers la base locale :
 * chaque sous-dossier (ex. `decks/maths/`) devient une matière, les fichiers
 * JSON à la racine restent acceptés (matière « Divers »).
 */
export async function syncDecks(): Promise<SyncResult> {
  const { decks, errors } = await fetchRepoDecks();
  const result: SyncResult = { created: 0, updated: 0, removed: 0, total: decks.length, errors };
  for (const deck of decks) {
    try {
      const outcome = await upsertSyncedDeck(deck);
      if (outcome === 'created') result.created += 1;
      else result.updated += 1;
    } catch (error) {
      result.errors.push(`${deck.title} : ${error instanceof Error ? error.message : 'échec de l’enregistrement'}`);
    }
  }
  result.removed = await removeDecksNotIn(decks.map((deck) => deck.id));
  await setMetadata(LAST_SYNC_KEY, String(Date.now()));
  return result;
}

if (__DEV__) {
  // Pratique pour tester la synchronisation depuis la console web.
  (globalThis as { __syncDecks?: typeof syncDecks }).__syncDecks = syncDecks;
}
