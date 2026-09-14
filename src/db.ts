import * as SQLite from 'expo-sqlite';
import { Card, Deck, ReviewDelays } from './types';
import { shuffleCards } from './sessionQueue';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

function getDatabase() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('memento-v1.db').catch((error) => {
      // Web SQLite holds an exclusive File System Access API handle. Allow a
      // retry after another Mémento tab has released the database file.
      dbPromise = null;
      throw error;
    });
  }
  return dbPromise;
}

const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

/** Début du « jour de révision » à 4 h du matin : une carte notée pour
 * le lendemain redevient due à 4 h, pas exactement 24 h plus tard. */
const REVIEW_DAY_START_HOUR = 4;
const MINUTES_PER_DAY = 1440;

function startOfReviewDay(timestamp: number) {
  const date = new Date(timestamp);
  date.setHours(REVIEW_DAY_START_HOUR, 0, 0, 0);
  if (date.getTime() > timestamp) date.setDate(date.getDate() - 1);
  return date.getTime();
}

export async function initializeDatabase() {
  const db = await getDatabase();
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS decks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '#DFE5FA',
      daily_new_limit INTEGER NOT NULL DEFAULT 5,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL DEFAULT '',
      context TEXT NOT NULL DEFAULT '',
      photo_uri TEXT NOT NULL DEFAULT '',
      external_id TEXT,
      created_at INTEGER NOT NULL,
      UNIQUE(deck_id, external_id)
    );
    CREATE TABLE IF NOT EXISTS progress (
      card_id INTEGER PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
      first_seen_at INTEGER,
      next_due_at INTEGER,
      suspended INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      reviewed_at INTEGER NOT NULL,
      delay_minutes INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS cards_deck_idx ON cards(deck_id);
    CREATE INDEX IF NOT EXISTS progress_due_idx ON progress(next_due_at);
  `);

  const deckColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(decks)');
  const existingColumns = new Set(deckColumns.map((column) => column.name));
  const reviewDelayColumns = [
    ['again_delay_minutes', 0],
    ['soon_delay_minutes', 10],
    ['later_delay_minutes', 60],
    ['tomorrow_delay_minutes', 1440],
  ] as const;
  for (const [name, defaultValue] of reviewDelayColumns) {
    if (!existingColumns.has(name)) {
      await db.execAsync(`ALTER TABLE decks ADD COLUMN ${name} INTEGER NOT NULL DEFAULT ${defaultValue}`);
    }
  }
  if (!existingColumns.has('kind')) {
    await db.execAsync("ALTER TABLE decks ADD COLUMN kind TEXT NOT NULL DEFAULT 'people'");
  }
  if (!existingColumns.has('sync_id')) {
    await db.execAsync('ALTER TABLE decks ADD COLUMN sync_id TEXT');
    await db.execAsync('CREATE INDEX IF NOT EXISTS decks_sync_idx ON decks(sync_id)');
  }
  if (!existingColumns.has('subject')) {
    await db.execAsync("ALTER TABLE decks ADD COLUMN subject TEXT NOT NULL DEFAULT 'Divers'");
  }
  if (!existingColumns.has('grade')) {
    await db.execAsync('ALTER TABLE decks ADD COLUMN grade TEXT');
  }

  const syncedAnswerFix = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_metadata WHERE key = 'synced-answer-field-fixed'",
  );
  if (!syncedAnswerFix) {
    // Les anciennes synchros enregistraient la réponse dans `context` (affiché
    // comme INDICE) en laissant `last_name` (RÉPONSE) vide.
    await db.runAsync(
      "UPDATE cards SET last_name = context, context = '' WHERE external_id IS NOT NULL AND last_name = '' AND context != ''",
    );
    await db.runAsync(
      "INSERT INTO app_metadata (key, value) VALUES ('synced-answer-field-fixed', '1')",
    );
  }

  const demoRemoval = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_metadata WHERE key = 'demo-cards-removed'",
  );
  if (!demoRemoval) {
    await db.runAsync("DELETE FROM cards WHERE external_id GLOB 'demo-[1-6]'");
    await db.runAsync(
      `DELETE FROM decks
       WHERE title = 'Équipe produit'
         AND NOT EXISTS (SELECT 1 FROM cards WHERE cards.deck_id = decks.id)`,
    );
    await db.runAsync(
      "INSERT INTO app_metadata (key, value) VALUES ('demo-cards-removed', '1')",
    );
  }
}

export async function getDecks(): Promise<Deck[]> {
  const db = await getDatabase();
  const now = Date.now();
  return db.getAllAsync<Deck>(
    `SELECT d.*,
      COUNT(c.id) AS total_count,
      COALESCE(SUM(CASE WHEN c.id IS NOT NULL AND p.first_seen_at IS NULL THEN 1 ELSE 0 END), 0) AS new_count,
      COALESCE(SUM(CASE WHEN p.first_seen_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS learned_count,
      COALESCE(SUM(CASE WHEN p.next_due_at IS NOT NULL AND p.next_due_at <= ? AND p.suspended = 0 THEN 1 ELSE 0 END), 0) AS due_count,
      COALESCE(SUM(CASE WHEN p.first_seen_at >= ? THEN 1 ELSE 0 END), 0) AS introduced_today
    FROM decks d
    LEFT JOIN cards c ON c.deck_id = d.id
    LEFT JOIN progress p ON p.card_id = c.id
    GROUP BY d.id
    ORDER BY d.created_at ASC`,
    now, startOfToday(),
  );
}

export async function getDeck(deckId: number) {
  const decks = await getDecks();
  return decks.find((deck) => deck.id === deckId) ?? null;
}

export async function getDecksByIds(deckIds: number[]): Promise<Deck[]> {
  if (!deckIds.length) return [];
  const decks = await getDecks();
  const wanted = new Set(deckIds);
  return decks.filter((deck) => wanted.has(deck.id));
}

export async function getCards(deckId: number): Promise<Card[]> {
  const db = await getDatabase();
  return db.getAllAsync<Card>(
    `SELECT c.*, p.first_seen_at, p.next_due_at, p.suspended
     FROM cards c JOIN progress p ON p.card_id = c.id
     WHERE c.deck_id = ? ORDER BY c.first_name COLLATE NOCASE`,
    deckId,
  );
}

export async function createDeck(title: string, description: string, subject = 'Divers') {
  const db = await getDatabase();
  const palette = ['#DFE5FA', '#FBF2CF', '#FBE3DE', '#DCEDE2'];
  const count = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM decks');
  return db.runAsync(
    'INSERT INTO decks (title, description, color, daily_new_limit, subject, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    title.trim(), description.trim(), palette[(count?.count ?? 0) % palette.length], 5, subject.trim() || 'Divers', Date.now(),
  );
}

export async function updateDailyLimit(deckId: number, limit: number) {
  const db = await getDatabase();
  await db.runAsync('UPDATE decks SET daily_new_limit = ? WHERE id = ?', Math.max(0, limit), deckId);
}

export async function updateReviewDelays(deckId: number, delays: ReviewDelays) {
  const db = await getDatabase();
  const normalise = (value: number) => Math.max(0, Math.round(value));
  await db.runAsync(
    `UPDATE decks
     SET again_delay_minutes = ?, soon_delay_minutes = ?, later_delay_minutes = ?, tomorrow_delay_minutes = ?
     WHERE id = ?`,
    normalise(delays.again), normalise(delays.soon), normalise(delays.later), normalise(delays.tomorrow), deckId,
  );
}

export async function saveCard(input: {
  id?: number;
  deckId: number;
  firstName: string;
  lastName: string;
  context: string;
  photoUri: string;
}) {
  const db = await getDatabase();
  if (input.id) {
    await db.runAsync(
      'UPDATE cards SET first_name = ?, last_name = ?, context = ?, photo_uri = ? WHERE id = ?',
      input.firstName.trim(), input.lastName.trim(), input.context.trim(), input.photoUri, input.id,
    );
    return;
  }
  const result = await db.runAsync(
    `INSERT INTO cards (deck_id, first_name, last_name, context, photo_uri, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    input.deckId, input.firstName.trim(), input.lastName.trim(), input.context.trim(), input.photoUri, Date.now(),
  );
  await db.runAsync('INSERT INTO progress (card_id) VALUES (?)', result.lastInsertRowId);
}

export async function deleteCard(cardId: number) {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM cards WHERE id = ?', cardId);
}

export async function getSessionCards(deckIds: number[], newCardAllowance?: number): Promise<Card[]> {
  const db = await getDatabase();
  const decks = await getDecksByIds(deckIds);
  if (!decks.length) return [];
  const placeholders = deckIds.map(() => '?').join(',');
  const due = await db.getAllAsync<Card>(
    `SELECT c.*, p.first_seen_at, p.next_due_at, p.suspended
     FROM cards c JOIN progress p ON p.card_id = c.id
     WHERE c.deck_id IN (${placeholders}) AND p.suspended = 0 AND p.next_due_at IS NOT NULL AND p.next_due_at <= ?
     ORDER BY p.next_due_at ASC`,
    ...deckIds, Date.now(),
  );
  const allowance = newCardAllowance ?? decks.reduce((sum, deck) => sum + Math.max(0, Number(deck.daily_new_limit) - Number(deck.introduced_today)), 0);
  const fresh = await getNewCards(deckIds, allowance);
  return shuffleCards([...due, ...fresh]);
}

export async function getNewCards(deckIds: number[], limit: number, excludedIds: number[] = []): Promise<Card[]> {
  if (limit <= 0 || !deckIds.length) return [];
  const db = await getDatabase();
  const deckPlaceholders = deckIds.map(() => '?').join(',');
  const exclusion = excludedIds.length ? `AND c.id NOT IN (${excludedIds.map(() => '?').join(',')})` : '';
  return db.getAllAsync<Card>(
    `SELECT c.*, p.first_seen_at, p.next_due_at, p.suspended
     FROM cards c JOIN progress p ON p.card_id = c.id
     WHERE c.deck_id IN (${deckPlaceholders}) AND p.first_seen_at IS NULL AND p.suspended = 0 ${exclusion}
     ORDER BY c.created_at ASC LIMIT ?`,
    ...deckIds, ...excludedIds, limit,
  );
}

export async function recordReview(cardId: number, delayMinutes: number) {
  const db = await getDatabase();
  const now = Date.now();
  const days = delayMinutes >= MINUTES_PER_DAY ? Math.round(delayMinutes / MINUTES_PER_DAY) : 0;
  const nextDue = days
    ? startOfReviewDay(now) + days * 86_400_000
    : now + delayMinutes * 60_000;
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE progress SET first_seen_at = COALESCE(first_seen_at, ?), next_due_at = ? WHERE card_id = ?`,
      now, nextDue, cardId,
    );
    await db.runAsync(
      'INSERT INTO reviews (card_id, reviewed_at, delay_minutes) VALUES (?, ?, ?)',
      cardId, now, delayMinutes,
    );
  });
}

export async function markCardSeen(cardId: number) {
  const db = await getDatabase();
  const now = Date.now();
  await db.runAsync(
    `UPDATE progress
     SET first_seen_at = COALESCE(first_seen_at, ?), next_due_at = COALESCE(next_due_at, ?)
     WHERE card_id = ?`,
    now, now, cardId,
  );
}

export async function resetDeckProgress(deckId: number) {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE progress
       SET first_seen_at = NULL, next_due_at = NULL
       WHERE card_id IN (SELECT id FROM cards WHERE deck_id = ?)`,
      deckId,
    );
    await db.runAsync(
      'DELETE FROM reviews WHERE card_id IN (SELECT id FROM cards WHERE deck_id = ?)',
      deckId,
    );
  });
}

export async function setMetadata(key: string, value: string) {
  const db = await getDatabase();
  await db.runAsync(
    'INSERT INTO app_metadata (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key, value,
  );
}

export async function getMetadata(key: string): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_metadata WHERE key = ?', key);
  return row?.value ?? null;
}

export type ReviewBucket = 'again' | 'soon' | 'later' | 'tomorrow';

export type DayActivity = {
  /** Jour local au format YYYY-MM-DD. */
  day: string;
  reviews: number;
  cards: number;
};

export type StatsSnapshot = {
  /** Cartes distinctes revues aujourd'hui. */
  cardsSeenToday: number;
  /** Cartes ouvertes pour la première fois aujourd'hui. */
  newSeenToday: number;
  /** Nouvelles cartes du jour dont la dernière réponse est « Plus tard » ou « Demain ». */
  learnedToday: number;
  reviewsToday: number;
  breakdownToday: Record<ReviewBucket, number>;
  /** Jours consécutifs avec au moins une réponse (aujourd'hui ou hier inclus). */
  streakDays: number;
  /** 7 derniers jours, du plus ancien au plus récent. */
  history: DayActivity[];
  totalCards: number;
  learnedCards: number;
  dueCards: number;
};

const localDayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export async function getStatsSnapshot(): Promise<StatsSnapshot> {
  const db = await getDatabase();
  const todayStart = startOfToday();
  const now = Date.now();

  const [todayRow, learnedRow, newRow, historyRows, dayRows, globalRow] = await Promise.all([
    db.getFirstAsync<{ cards_seen: number; reviews: number; again: number; soon: number; later: number; tomorrow: number }>(
      `SELECT COUNT(DISTINCT r.card_id) AS cards_seen,
        COUNT(*) AS reviews,
        COALESCE(SUM(CASE WHEN r.delay_minutes <= d.again_delay_minutes THEN 1 ELSE 0 END), 0) AS again,
        COALESCE(SUM(CASE WHEN r.delay_minutes > d.again_delay_minutes AND r.delay_minutes <= d.soon_delay_minutes THEN 1 ELSE 0 END), 0) AS soon,
        COALESCE(SUM(CASE WHEN r.delay_minutes > d.soon_delay_minutes AND r.delay_minutes <= d.later_delay_minutes THEN 1 ELSE 0 END), 0) AS later,
        COALESCE(SUM(CASE WHEN r.delay_minutes > d.later_delay_minutes THEN 1 ELSE 0 END), 0) AS tomorrow
      FROM reviews r
      JOIN cards c ON c.id = r.card_id
      JOIN decks d ON d.id = c.deck_id
      WHERE r.reviewed_at >= ?`,
      todayStart,
    ),
    // Dernière réponse du jour par carte nouvelle : en SQLite, les colonnes
    // nues proviennent de la ligne qui maximise MAX(reviewed_at).
    db.getFirstAsync<{ learned: number }>(
      `SELECT COUNT(*) AS learned FROM (
        SELECT r.delay_minutes AS delay_minutes, d.soon_delay_minutes AS soon_delay, MAX(r.reviewed_at) AS last_review
        FROM reviews r
        JOIN cards c ON c.id = r.card_id
        JOIN decks d ON d.id = c.deck_id
        WHERE r.reviewed_at >= ?
          AND r.card_id IN (SELECT card_id FROM progress WHERE first_seen_at >= ?)
        GROUP BY r.card_id
      ) WHERE delay_minutes > soon_delay`,
      todayStart, todayStart,
    ),
    db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) AS count FROM progress WHERE first_seen_at >= ?',
      todayStart,
    ),
    db.getAllAsync<{ day: string; reviews: number; cards: number }>(
      `SELECT strftime('%Y-%m-%d', reviewed_at / 1000, 'unixepoch', 'localtime') AS day,
        COUNT(*) AS reviews, COUNT(DISTINCT card_id) AS cards
      FROM reviews
      WHERE reviewed_at >= ?
      GROUP BY day`,
      todayStart - 6 * 86_400_000,
    ),
    db.getAllAsync<{ day: string }>(
      `SELECT DISTINCT strftime('%Y-%m-%d', reviewed_at / 1000, 'unixepoch', 'localtime') AS day
      FROM reviews ORDER BY day DESC`,
    ),
    db.getFirstAsync<{ total: number; learned: number; due: number }>(
      `SELECT COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN first_seen_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS learned,
        COALESCE(SUM(CASE WHEN next_due_at IS NOT NULL AND next_due_at <= ? AND suspended = 0 THEN 1 ELSE 0 END), 0) AS due
      FROM progress`,
      now,
    ),
  ]);

  const byDay = new Map(historyRows.map((row) => [row.day, row]));
  const history: DayActivity[] = [];
  for (let index = 6; index >= 0; index -= 1) {
    const date = new Date(todayStart);
    date.setDate(date.getDate() - index);
    const key = localDayKey(date);
    const row = byDay.get(key);
    history.push({ day: key, reviews: Number(row?.reviews ?? 0), cards: Number(row?.cards ?? 0) });
  }

  const activeDays = new Set(dayRows.map((row) => row.day));
  let streakDays = 0;
  const cursor = new Date(todayStart);
  if (!activeDays.has(localDayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (activeDays.has(localDayKey(cursor))) {
    streakDays += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return {
    cardsSeenToday: Number(todayRow?.cards_seen ?? 0),
    reviewsToday: Number(todayRow?.reviews ?? 0),
    learnedToday: Number(learnedRow?.learned ?? 0),
    newSeenToday: Number(newRow?.count ?? 0),
    breakdownToday: {
      again: Number(todayRow?.again ?? 0),
      soon: Number(todayRow?.soon ?? 0),
      later: Number(todayRow?.later ?? 0),
      tomorrow: Number(todayRow?.tomorrow ?? 0),
    },
    streakDays,
    history,
    totalCards: Number(globalRow?.total ?? 0),
    learnedCards: Number(globalRow?.learned ?? 0),
    dueCards: Number(globalRow?.due ?? 0),
  };
}

export type SubjectPrefs = {
  hidden: string[];
  custom: string[];
};

const SUBJECT_PREFS_KEY = 'subject-prefs';

export async function getSubjectPrefs(): Promise<SubjectPrefs> {
  const raw = await getMetadata(SUBJECT_PREFS_KEY);
  if (!raw) return { hidden: [], custom: [] };
  try {
    const parsed = JSON.parse(raw) as Partial<SubjectPrefs>;
    return {
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden : [],
      custom: Array.isArray(parsed.custom) ? parsed.custom : [],
    };
  } catch {
    return { hidden: [], custom: [] };
  }
}

export async function setSubjectPrefs(prefs: SubjectPrefs) {
  await setMetadata(SUBJECT_PREFS_KEY, JSON.stringify({ hidden: prefs.hidden, custom: prefs.custom }));
}

/** Branches repliées de l'arbre de progression, par matière et titre de branche. */
export type ProgressionFolds = {
  folded: string[];
};

const PROGRESSION_FOLDS_KEY = 'progression-folds';

export async function getProgressionFolds(): Promise<ProgressionFolds> {
  const raw = await getMetadata(PROGRESSION_FOLDS_KEY);
  if (!raw) return { folded: [] };
  try {
    const parsed = JSON.parse(raw) as Partial<ProgressionFolds>;
    return { folded: Array.isArray(parsed.folded) ? parsed.folded : [] };
  } catch {
    return { folded: [] };
  }
}

export async function setProgressionFolds(folds: ProgressionFolds) {
  await setMetadata(PROGRESSION_FOLDS_KEY, JSON.stringify({ folded: folds.folded }));
}

export type SyncedCard = {
  id: string;
  front: string;
  back?: string;
  indice?: string;
};

export type SyncedDeck = {
  id: string;
  title: string;
  description?: string;
  color?: string;
  format?: string;
  daily_new_limit?: number;
  subject?: string;
  grade?: string;
  cards: SyncedCard[];
};

/** Matières ayant au moins un deck synchronisé localement. */
export async function getSyncedSubjects(): Promise<Set<string>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ subject: string }>(
    'SELECT DISTINCT subject FROM decks WHERE sync_id IS NOT NULL',
  );
  return new Set(rows.map((row) => row.subject));
}

/** Crée ou met à jour un paquet synchronisé (et ses cartes) en conservant la progression. */
export async function upsertSyncedDeck(deck: SyncedDeck): Promise<'created' | 'updated'> {
  const db = await getDatabase();
  const kind = deck.format === 'math' ? 'math' : 'people';
  const color = deck.color && /^#[0-9A-Fa-f]{6}$/.test(deck.color) ? deck.color : '#DDE9DE';
  const dailyNewLimit = Math.max(0, Math.round(deck.daily_new_limit ?? 5));
  const description = deck.description?.trim() ?? '';
  const subject = deck.subject?.trim() || 'Divers';
  const grade = deck.grade?.trim() || null;

  const existing = await db.getFirstAsync<{ id: number }>('SELECT id FROM decks WHERE sync_id = ?', deck.id);
  let deckId: number;
  let outcome: 'created' | 'updated';
  if (existing) {
    await db.runAsync(
      'UPDATE decks SET title = ?, description = ?, color = ?, kind = ?, daily_new_limit = ?, subject = ?, grade = ? WHERE id = ?',
      deck.title, description, color, kind, dailyNewLimit, subject, grade, existing.id,
    );
    deckId = existing.id;
    outcome = 'updated';
  } else {
    const inserted = await db.runAsync(
      `INSERT INTO decks (title, description, color, daily_new_limit, kind, sync_id, subject, grade, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      deck.title, description, color, dailyNewLimit, kind, deck.id, subject, grade, Date.now(),
    );
    deckId = inserted.lastInsertRowId;
    outcome = 'created';
  }

  await db.withTransactionAsync(async () => {
    for (const card of deck.cards) {
      const front = card.front.trim();
      const back = card.back?.trim() ?? '';
      const indice = card.indice?.trim() ?? '';
      const externalId = `${deck.id}:${card.id}`;
      const existingCard = await db.getFirstAsync<{ id: number }>(
        'SELECT id FROM cards WHERE deck_id = ? AND external_id = ?', deckId, externalId,
      );
      if (existingCard) {
        await db.runAsync(
          'UPDATE cards SET first_name = ?, last_name = ?, context = ?, photo_uri = \'\' WHERE id = ?',
          front, back, indice, existingCard.id,
        );
        continue;
      }
      const insertedCard = await db.runAsync(
        `INSERT INTO cards (deck_id, first_name, last_name, context, photo_uri, external_id, created_at)
         VALUES (?, ?, ?, ?, '', ?, ?)`,
        deckId, front, back, indice, externalId, Date.now(),
      );
      await db.runAsync('INSERT INTO progress (card_id) VALUES (?)', insertedCard.lastInsertRowId);
    }
  });
  return outcome;
}

/** Supprime les paquets synchronisés absents du dépôt (cascade cartes + progression). */
export async function removeDecksNotIn(syncIds: string[]): Promise<number> {
  const db = await getDatabase();
  if (!syncIds.length) {
    const result = await db.runAsync('DELETE FROM decks WHERE sync_id IS NOT NULL');
    return result.changes;
  }
  const placeholders = syncIds.map(() => '?').join(', ');
  const result = await db.runAsync(
    `DELETE FROM decks WHERE sync_id IS NOT NULL AND sync_id NOT IN (${placeholders})`,
    ...syncIds,
  );
  return result.changes;
}
