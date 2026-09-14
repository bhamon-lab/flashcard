export type Deck = {
  id: number;
  title: string;
  description: string;
  color: string;
  kind: string;
  subject: string;
  grade: string | null;
  sync_id: string | null;
  /** Langue de synthèse vocale pour les paquets de compréhension orale (ex. « en-GB »), vide sinon. */
  audio_language: string;
  daily_new_limit: number;
  again_delay_minutes: number;
  soon_delay_minutes: number;
  later_delay_minutes: number;
  tomorrow_delay_minutes: number;
  total_count: number;
  due_count: number;
  new_count: number;
  learned_count: number;
  introduced_today: number;
};

export type Card = {
  id: number;
  deck_id: number;
  first_name: string;
  last_name: string;
  context: string;
  photo_uri: string;
  /** Texte à prononcer à voix haute (compréhension orale), vide sinon. */
  audio_text: string;
  external_id: string | null;
  created_at: number;
  first_seen_at: number | null;
  next_due_at: number | null;
  suspended: number;
};

export type ReviewDelay = number;

export type ReviewDelays = {
  again: number;
  soon: number;
  later: number;
  tomorrow: number;
};
