export type Deck = {
  id: number;
  title: string;
  description: string;
  color: string;
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

export type ImportResult = {
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
};
