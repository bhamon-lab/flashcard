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

export async function createDeck(title: string, description: string) {
  const db = await getDatabase();
  const palette = ['#DFE5FA', '#FBF2CF', '#FBE3DE', '#DCEDE2'];
  const count = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM decks');
  return db.runAsync(
    'INSERT INTO decks (title, description, color, daily_new_limit, created_at) VALUES (?, ?, ?, ?, ?)',
    title.trim(), description.trim(), palette[(count?.count ?? 0) % palette.length], 5, Date.now(),
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
  const nextDue = now + delayMinutes * 60_000;
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

export type SyncedCard = {
  id: string;
  front: string;
  back?: string;
};

export type SyncedDeck = {
  id: string;
  title: string;
  description?: string;
  color?: string;
  format?: string;
  daily_new_limit?: number;
  cards: SyncedCard[];
};

/** Crée ou met à jour un paquet synchronisé (et ses cartes) en conservant la progression. */
export async function upsertSyncedDeck(deck: SyncedDeck): Promise<'created' | 'updated'> {
  const db = await getDatabase();
  const kind = deck.format === 'math' ? 'math' : 'people';
  const color = deck.color && /^#[0-9A-Fa-f]{6}$/.test(deck.color) ? deck.color : '#DDE9DE';
  const dailyNewLimit = Math.max(0, Math.round(deck.daily_new_limit ?? 5));
  const description = deck.description?.trim() ?? '';

  const existing = await db.getFirstAsync<{ id: number }>('SELECT id FROM decks WHERE sync_id = ?', deck.id);
  let deckId: number;
  let outcome: 'created' | 'updated';
  if (existing) {
    await db.runAsync(
      'UPDATE decks SET title = ?, description = ?, color = ?, kind = ?, daily_new_limit = ? WHERE id = ?',
      deck.title, description, color, kind, dailyNewLimit, existing.id,
    );
    deckId = existing.id;
    outcome = 'updated';
  } else {
    const inserted = await db.runAsync(
      `INSERT INTO decks (title, description, color, daily_new_limit, kind, sync_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      deck.title, description, color, dailyNewLimit, kind, deck.id, Date.now(),
    );
    deckId = inserted.lastInsertRowId;
    outcome = 'created';
  }

  await db.withTransactionAsync(async () => {
    for (const card of deck.cards) {
      const front = card.front.trim();
      const back = card.back?.trim() ?? '';
      const externalId = `${deck.id}:${card.id}`;
      const existingCard = await db.getFirstAsync<{ id: number }>(
        'SELECT id FROM cards WHERE deck_id = ? AND external_id = ?', deckId, externalId,
      );
      if (existingCard) {
        await db.runAsync(
          "UPDATE cards SET first_name = ?, last_name = '', context = ?, photo_uri = '' WHERE id = ?",
          front, back, existingCard.id,
        );
        continue;
      }
      const insertedCard = await db.runAsync(
        `INSERT INTO cards (deck_id, first_name, last_name, context, photo_uri, external_id, created_at)
         VALUES (?, ?, '', ?, '', ?, ?)`,
        deckId, front, back, externalId, Date.now(),
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
