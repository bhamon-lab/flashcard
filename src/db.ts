import * as SQLite from 'expo-sqlite';
import { Card, Deck, ImportResult, ReviewDelays } from './types';
import { parseImportRows } from './csv';
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
      color TEXT NOT NULL DEFAULT '#DDE9DE',
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
  const palette = ['#DDE9DE', '#CBDDF5', '#FBE5DF', '#F4E8B5'];
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

export async function getSessionCards(deckId: number, newCardAllowance?: number): Promise<Card[]> {
  const db = await getDatabase();
  const deck = await getDeck(deckId);
  if (!deck) return [];
  const due = await db.getAllAsync<Card>(
    `SELECT c.*, p.first_seen_at, p.next_due_at, p.suspended
     FROM cards c JOIN progress p ON p.card_id = c.id
     WHERE c.deck_id = ? AND p.suspended = 0 AND p.next_due_at IS NOT NULL AND p.next_due_at <= ?
     ORDER BY p.next_due_at ASC`,
    deckId, Date.now(),
  );
  const allowance = newCardAllowance ?? Math.max(0, deck.daily_new_limit - deck.introduced_today);
  const fresh = await getNewCards(deckId, allowance);
  return shuffleCards([...due, ...fresh]);
}

export async function getNewCards(deckId: number, limit: number, excludedIds: number[] = []): Promise<Card[]> {
  if (limit <= 0) return [];
  const db = await getDatabase();
  const exclusion = excludedIds.length ? `AND c.id NOT IN (${excludedIds.map(() => '?').join(',')})` : '';
  return db.getAllAsync<Card>(
    `SELECT c.*, p.first_seen_at, p.next_due_at, p.suspended
     FROM cards c JOIN progress p ON p.card_id = c.id
     WHERE c.deck_id = ? AND p.first_seen_at IS NULL AND p.suspended = 0 ${exclusion}
     ORDER BY c.created_at ASC LIMIT ?`,
    deckId, ...excludedIds, limit,
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

export async function importCsv(deckId: number, csvText: string, photoUris: Record<string, string> = {}): Promise<ImportResult> {
  const db = await getDatabase();
  const parsed = parseImportRows(csvText);
  const result: ImportResult = { imported: 0, updated: 0, skipped: 0, errors: [...parsed.errors] };
  const rows = parsed.rows;
  await db.withTransactionAsync(async () => {
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const firstName = row.firstName.trim();
      const lastName = row.lastName.trim();
      const context = row.context.trim();
      const externalId = row.externalId.trim();
      const photoUri = photoUris[row.photo] ?? photoUris[row.photo.split('/').pop() ?? ''] ?? row.photo.trim();
      if (!firstName) {
        result.skipped += 1;
        result.errors.push(`Ligne ${row.line} : prénom manquant`);
        continue;
      }
      if (externalId) {
        const existing = await db.getFirstAsync<{ id: number }>(
          'SELECT id FROM cards WHERE deck_id = ? AND external_id = ?', deckId, externalId,
        );
        if (existing) {
          await db.runAsync(
            `UPDATE cards SET first_name = ?, last_name = ?, context = ?, photo_uri = ? WHERE id = ?`,
            firstName, lastName, context, photoUri, existing.id,
          );
          result.updated += 1;
          continue;
        }
      }
      const inserted = await db.runAsync(
        `INSERT INTO cards (deck_id, first_name, last_name, context, photo_uri, external_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        deckId, firstName, lastName, context, photoUri, externalId || null, Date.now(),
      );
      await db.runAsync('INSERT INTO progress (card_id) VALUES (?)', inserted.lastInsertRowId);
      result.imported += 1;
    }
  });
  return result;
}
