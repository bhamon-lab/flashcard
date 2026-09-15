import Constants from 'expo-constants';
import {
  getCurriculumMap,
  getMetadata,
  getSyncedSubjects,
  removeDecksNotIn,
  saveCurriculumOverrides,
  setMetadata,
  upsertSyncedDeck,
  type SyncedDeck,
} from './db';
import { asCurriculum } from './progression';

const DEFAULT_REPO = 'bhamon-lab/flashcard';
const DECKS_PATH = 'decks';
const CURRICULUM_PATH = 'curriculum';
const LAST_SYNC_KEY = 'decks-last-sync';
// Clé versionnée : le passage à v2 (champs audio de compréhension orale) force
// un re-téléchargement complet une seule fois, y compris des fichiers inchangés.
const FILE_STATE_KEY = 'decks-file-state-v2';
const CURRICULUM_STATE_KEY = 'curriculum-file-state';
const BUNDLE_NAME = '_bundle.json';
const BUNDLE_THRESHOLD = 20;

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
  sha?: string;
  download_url: string | null;
};

/** État connu d'un fichier distant : SHA git du blob + id du deck importé. */
type FileState = { sha: string; deckId: string };
type FileStateMap = Record<string, FileState>;

type BundlePayload = {
  files?: { file?: unknown; sha?: unknown; raw?: unknown }[];
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
      indice: typeof card.indice === 'string' ? card.indice.trim() : '',
      audio_text: typeof card.audio_text === 'string' ? card.audio_text.trim() : '',
    });
  });
  if (!normalized.length) return null;
  const subject = typeof candidate.subject === 'string' && candidate.subject.trim() ? candidate.subject.trim() : fallbackSubject;
  const grade = typeof candidate.grade === 'string' && candidate.grade.trim() ? candidate.grade.trim() : undefined;
  const mode = typeof candidate.mode === 'string' ? candidate.mode.trim() : undefined;
  const audioLanguage = typeof candidate.audio_language === 'string' ? candidate.audio_language.trim() : undefined;
  return {
    id,
    title,
    subject,
    grade,
    mode,
    audio_language: audioLanguage || undefined,
    description: typeof candidate.description === 'string' ? candidate.description.trim() : '',
    color: typeof candidate.color === 'string' ? candidate.color : undefined,
    format: candidate.format === 'math' ? 'math' : 'people',
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

async function readFileState(): Promise<FileStateMap> {
  const raw = await getMetadata(FILE_STATE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as FileStateMap;
  } catch {
    return {};
  }
}

/** Reporte l'état d'un dossier (listing en échec) pour ne pas supprimer ses decks. */
function carryState(previousState: FileStateMap, nextState: FileStateMap, prefix: string) {
  for (const [key, state] of Object.entries(previousState)) {
    if (key.startsWith(prefix)) nextState[key] = state;
  }
}

/**
 * Nombre de fichiers d'une matière à télécharger (nouveaux ou modifiés, mêmes
 * critères que syncFileEntry). Sert à décider si le bundle compact vaut le
 * coup face aux requêtes fichier à fichier.
 */
function countPendingFiles(files: GitHubContent[], previousState: FileStateMap, keyPrefix: string): number {
  let count = 0;
  for (const file of files) {
    if (file.type !== 'file' || !file.name.toLowerCase().endsWith('.json')) continue;
    if (file.name === BUNDLE_NAME || file.name.startsWith('_')) continue;
    const previous = previousState[keyPrefix + file.name];
    if (!previous || !file.sha || previous.sha !== file.sha) count += 1;
  }
  return count;
}

/**
 * Télécharge le bundle compact d'une matière (généré par le git hook, un seul
 * fichier pour toute la matière). Renvoie null si le bundle est absent :
 * l'appelant se replie alors sur le listing fichier à fichier.
 */
async function fetchBundleStates(
  url: string,
  fallbackSubject: string,
  label: string,
  decks: SyncedDeck[],
  errors: string[],
): Promise<FileStateMap | null> {
  let payload: BundlePayload;
  try {
    const response = await fetch(url);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    payload = (await response.json()) as BundlePayload;
  } catch (error) {
    errors.push(`${label}/${BUNDLE_NAME} : ${error instanceof Error ? error.message : 'illisible'}`);
    return null;
  }
  if (!payload || !Array.isArray(payload.files)) return null;
  const states: FileStateMap = {};
  for (const entry of payload.files) {
    const fileName = typeof entry?.file === 'string' ? entry.file : '';
    const sha = typeof entry?.sha === 'string' ? entry.sha : '';
    const deck = asDeck(entry?.raw, fileName || 'deck.json', fallbackSubject);
    if (!deck || !sha) {
      errors.push(`${label}/${fileName || '?'} : entrée de bundle invalide.`);
      continue;
    }
    decks.push(deck);
    states[`${label}/${fileName}`] = { sha, deckId: deck.id };
  }
  return states;
}

/**
 * Synchronise un fichier distant : inchangé (SHA identique) → conservé sans
 * re-téléchargement ; nouveau/modifié → téléchargé ; en échec → conservé
 * tel quel pour éviter toute perte.
 */
async function syncFileEntry(
  entry: GitHubContent,
  key: string,
  fallbackSubject: string,
  previousState: FileStateMap,
  nextState: FileStateMap,
  decks: SyncedDeck[],
  errors: string[],
): Promise<void> {
  if (entry.type !== 'file' || !entry.name.toLowerCase().endsWith('.json')) return;
  if (entry.name === BUNDLE_NAME || entry.name.startsWith('_')) return;
  const previous = previousState[key];
  if (previous && entry.sha && previous.sha === entry.sha) {
    nextState[key] = previous;
    return;
  }
  if (!entry.download_url) {
    if (previous) nextState[key] = previous;
    errors.push(`${entry.name} : URL de téléchargement indisponible.`);
    return;
  }
  try {
    const fileResponse = await fetch(entry.download_url);
    if (!fileResponse.ok) throw new Error(`HTTP ${fileResponse.status}`);
    const deck = asDeck(await fileResponse.json(), entry.name, fallbackSubject);
    if (!deck) {
      if (previous) nextState[key] = previous;
      errors.push(`${entry.name} : format invalide (title et cards avec front requis).`);
      return;
    }
    decks.push(deck);
    nextState[key] = { sha: entry.sha ?? '', deckId: deck.id };
  } catch (error) {
    if (previous) nextState[key] = previous;
    errors.push(`${entry.name} : ${error instanceof Error ? error.message : 'illisible'}`);
  }
}

/**
 * Synchronise les decks du dossier `decks/` du dépôt GitHub vers la base locale :
 * - matière absente localement → télécharge le bundle compact `_bundle.json`
 *   généré par le git hook (une seule requête pour toute la matière) ;
 * - matière déjà présente → compare les SHA des fichiers et ne télécharge que
 *   les decks nouveaux ou modifiés ; si plus de 20 fichiers à télécharger,
 *   re-télécharge le bundle (une seule requête raw, hors quota API GitHub).
 * Chaque sous-dossier (ex. `decks/maths/`) devient une matière, les fichiers
 * JSON à la racine restent acceptés (matière « Divers »).
 */
export async function syncDecks(): Promise<SyncResult> {
  const entries = await listGithubContents(DECKS_PATH);
  const previousState = await readFileState();
  const nextState: FileStateMap = {};
  const decks: SyncedDeck[] = [];
  const errors: string[] = [];
  const localSubjects = await getSyncedSubjects();
  const rawBase = `https://raw.githubusercontent.com/${repoIdentifier()}/HEAD/${DECKS_PATH}`;

  for (const entry of entries) {
    if (entry.type !== 'dir') continue;
    const subject = subjectFromFolder(entry.name);
    const prefix = `${entry.name}/`;
    try {
      if (!localSubjects.has(subject)) {
        const bundleStates = await fetchBundleStates(
          `${rawBase}/${entry.name}/${BUNDLE_NAME}`,
          subject,
          entry.name,
          decks,
          errors,
        );
        if (bundleStates) {
          Object.assign(nextState, bundleStates);
          continue;
        }
        // Pas de bundle (dépôt pas encore à jour) : repli fichier à fichier.
        const subjectFiles = await listGithubContents(entry.path);
        for (const file of subjectFiles) {
          await syncFileEntry(file, prefix + file.name, subject, previousState, nextState, decks, errors);
        }
        continue;
      }
      const subjectFiles = await listGithubContents(entry.path);
      // Trop de fichiers à télécharger → une seule requête raw via le bundle,
      // pour éviter le rate limit de l'API GitHub.
      if (countPendingFiles(subjectFiles, previousState, prefix) > BUNDLE_THRESHOLD) {
        const bundleStates = await fetchBundleStates(
          `${rawBase}/${entry.name}/${BUNDLE_NAME}`,
          subject,
          entry.name,
          decks,
          errors,
        );
        if (bundleStates) {
          Object.assign(nextState, bundleStates);
          continue;
        }
      }
      for (const file of subjectFiles) {
        await syncFileEntry(file, prefix + file.name, subject, previousState, nextState, decks, errors);
      }
    } catch (error) {
      carryState(previousState, nextState, prefix);
      errors.push(`${entry.name}/ : ${error instanceof Error ? error.message : 'illisible'}`);
    }
  }

  // Ancienne organisation à plat : paquets sans dossier de matière (« Divers »).
  const rootBundle = entries.find((entry) => entry.type === 'file' && entry.name === BUNDLE_NAME);
  const rootFiles = entries.filter((entry) => entry.type === 'file');
  const diversLocal = localSubjects.has('Divers');
  const rootPending = diversLocal ? countPendingFiles(rootFiles, previousState, '') : rootFiles.length;
  let rootFromBundle = false;
  if (rootBundle?.download_url && rootPending > BUNDLE_THRESHOLD) {
    const bundleStates = await fetchBundleStates(rootBundle.download_url, 'Divers', BUNDLE_NAME, decks, errors);
    if (bundleStates) {
      Object.assign(nextState, bundleStates);
      rootFromBundle = true;
    }
  }
  if (!rootFromBundle) {
    for (const entry of rootFiles) {
      await syncFileEntry(entry, entry.name, 'Divers', previousState, nextState, decks, errors);
    }
  }

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
  const expectedIds = [...new Set(Object.values(nextState).map((state) => state.deckId))];
  result.removed = await removeDecksNotIn(expectedIds);
  await setMetadata(FILE_STATE_KEY, JSON.stringify(nextState));
  await setMetadata(LAST_SYNC_KEY, String(Date.now()));
  return result;
}

export type CurriculumSyncResult = {
  updated: number;
  removed: number;
  errors: string[];
};

async function readCurriculumState(): Promise<FileStateMap> {
  const raw = await getMetadata(CURRICULUM_STATE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as FileStateMap;
  } catch {
    return {};
  }
}

/**
 * Synchronise les curricula du dossier `curriculum/` du dépôt vers la base
 * locale, avec la même logique que les decks : seuls les fichiers nouveaux ou
 * modifiés (SHA git) sont téléchargés, un fichier illisible ou invalide
 * conserve sa version précédente, et un fichier disparu du dépôt est retiré
 * (repli sur le curriculum embarqué dans l'app).
 */
export async function syncCurriculums(): Promise<CurriculumSyncResult> {
  const result: CurriculumSyncResult = { updated: 0, removed: 0, errors: [] };
  const entries = await listGithubContents(CURRICULUM_PATH);
  const previousState = await readCurriculumState();
  const nextState: FileStateMap = {};
  const overrides = await getCurriculumMap();
  let changed = false;

  for (const entry of entries) {
    if (entry.type !== 'file' || !entry.name.toLowerCase().endsWith('.json')) continue;
    const previous = previousState[entry.name];
    if (previous && entry.sha && previous.sha === entry.sha) {
      nextState[entry.name] = previous;
      continue;
    }
    if (!entry.download_url) {
      if (previous) nextState[entry.name] = previous;
      result.errors.push(`${entry.name} : URL de téléchargement indisponible.`);
      continue;
    }
    try {
      const response = await fetch(entry.download_url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const curriculum = asCurriculum(await response.json());
      if (!curriculum) {
        if (previous) nextState[entry.name] = previous;
        result.errors.push(`${entry.name} : format de curriculum invalide.`);
        continue;
      }
      overrides[entry.name] = curriculum;
      nextState[entry.name] = { sha: entry.sha ?? '', deckId: curriculum.subject };
      changed = true;
      result.updated += 1;
    } catch (error) {
      if (previous) nextState[entry.name] = previous;
      result.errors.push(`${entry.name} : ${error instanceof Error ? error.message : 'illisible'}`);
    }
  }

  // Fichiers disparus du dépôt → on retire leur override (repli embarqué).
  for (const fileName of Object.keys(overrides)) {
    if (!nextState[fileName]) {
      delete overrides[fileName];
      changed = true;
      result.removed += 1;
    }
  }

  if (changed) {
    await saveCurriculumOverrides(overrides);
    await setMetadata(CURRICULUM_STATE_KEY, JSON.stringify(nextState));
  }
  return result;
}

if (__DEV__) {
  // Pratique pour tester la synchronisation depuis la console web.
  (globalThis as { __syncDecks?: typeof syncDecks }).__syncDecks = syncDecks;
  (globalThis as { __syncCurriculums?: typeof syncCurriculums }).__syncCurriculums = syncCurriculums;
}
