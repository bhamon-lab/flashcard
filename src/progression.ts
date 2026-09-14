import { CURRICULUMS } from '../curriculum';
import type { Deck } from './types';

export type CurriculumNode = {
  id: string;
  deck_id: string;
  grade: string;
  title: string;
  domain: string;
  source_id: string;
  source_section: string;
  prerequisites: string[];
  card_count: number;
};

export type CurriculumBranch = { title: string; domains: string[] };

export type CurriculumSource = { id: string; url: string; label: string };

/** Un fichier JSON par matière dans curriculum/ (commun collège et lycée). */
export type CurriculumData = {
  schema_version: number;
  subject: string;
  school_year: string;
  country: string;
  description: string;
  /** Ordre de lecture des classes, de la 6e à la terminale. */
  grade_order: string[];
  grade_labels: Record<string, string>;
  /** Libellé du parcours pour les classes qui se déclinent (ex. spécialité / complémentaires). */
  tracks: Record<string, string>;
  /** Branches thématiques : chaque rubrique du programme (domain) est rattachée à une branche. */
  branches: CurriculumBranch[];
  sources: CurriculumSource[];
  nodes: CurriculumNode[];
};

/** Feuille de l'arbre : un deck local avec son titre court du curriculum. */
export type ProgressionDeck = { deck: Deck; title: string };

/** Parcours de terminale (spécialité ou maths complémentaires). */
export type ProgressionTrack = { label: string; decks: ProgressionDeck[] };

/** Niveau scolaire dans une branche thématique. */
export type ProgressionLevel = { grade: string; label: string; tracks: ProgressionTrack[] };

/** Branche thématique de l'arbre de progression. */
export type ProgressionBranch = { title: string; levels: ProgressionLevel[] };

/** Renvoie le curriculum de la matière (recherche insensible à la casse), ou null. */
export function getCurriculumForSubject(
  subject: string,
  curriculums: CurriculumData[] = CURRICULUMS,
): CurriculumData | null {
  const needle = subject.trim().toLowerCase();
  return curriculums.find((entry) => entry.subject.trim().toLowerCase() === needle) ?? null;
}

/**
 * Fusionne les curricula téléchargés avec les embarqués : une version téléchargée
 * remplace sa version embarquée, les matières inconnues s'ajoutent, et les
 * embarqués restent le repli hors ligne (avant la première sync ou fichier disparu).
 */
export function mergeCurriculums(overrides: CurriculumData[]): CurriculumData[] {
  if (!overrides.length) return CURRICULUMS;
  const bySubject = new Map(overrides.map((entry) => [entry.subject.trim().toLowerCase(), entry]));
  const bundledSubjects = new Set(CURRICULUMS.map((entry) => entry.subject.trim().toLowerCase()));
  const merged = CURRICULUMS.map((entry) => bySubject.get(entry.subject.trim().toLowerCase()) ?? entry);
  for (const entry of overrides) {
    if (!bundledSubjects.has(entry.subject.trim().toLowerCase())) merged.push(entry);
  }
  return merged;
}

/** Valide et normalise un curriculum JSON brut (téléchargé du dépôt). Renvoie null si inexploitable. */
export function asCurriculum(raw: unknown): CurriculumData | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Record<string, unknown>;
  const subject = typeof candidate.subject === 'string' ? candidate.subject.trim() : '';
  if (!subject) return null;

  const branches: CurriculumBranch[] = [];
  if (Array.isArray(candidate.branches)) {
    for (const rawBranch of candidate.branches) {
      if (!rawBranch || typeof rawBranch !== 'object') continue;
      const entry = rawBranch as Record<string, unknown>;
      const title = typeof entry.title === 'string' ? entry.title.trim() : '';
      const domains = Array.isArray(entry.domains)
        ? entry.domains.filter((domain): domain is string => typeof domain === 'string' && domain.trim().length > 0)
        : [];
      if (!title || !domains.length) continue;
      branches.push({ title, domains });
    }
  }
  if (!branches.length) return null;

  const nodes: CurriculumNode[] = [];
  if (Array.isArray(candidate.nodes)) {
    for (const rawNode of candidate.nodes) {
      if (!rawNode || typeof rawNode !== 'object') continue;
      const entry = rawNode as Record<string, unknown>;
      const id = typeof entry.id === 'string' ? entry.id.trim() : '';
      const deckId = typeof entry.deck_id === 'string' ? entry.deck_id.trim() : '';
      const grade = typeof entry.grade === 'string' ? entry.grade.trim() : '';
      const title = typeof entry.title === 'string' ? entry.title.trim() : '';
      const domain = typeof entry.domain === 'string' ? entry.domain.trim() : '';
      if (!id || !deckId || !grade || !title || !domain) continue;
      nodes.push({
        id,
        deck_id: deckId,
        grade,
        title,
        domain,
        source_id: typeof entry.source_id === 'string' ? entry.source_id.trim() : '',
        source_section: typeof entry.source_section === 'string' ? entry.source_section.trim() : '',
        prerequisites: Array.isArray(entry.prerequisites)
          ? entry.prerequisites.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
          : [],
        card_count: typeof entry.card_count === 'number' && Number.isFinite(entry.card_count) ? entry.card_count : 0,
      });
    }
  }

  const grade_order = Array.isArray(candidate.grade_order)
    ? candidate.grade_order.filter((grade): grade is string => typeof grade === 'string' && grade.trim().length > 0)
    : [];
  const stringMap = (value: unknown) => {
    const map: Record<string, string> = {};
    if (value && typeof value === 'object') {
      for (const [key, label] of Object.entries(value)) {
        if (typeof label === 'string') map[key] = label;
      }
    }
    return map;
  };
  const sources: CurriculumSource[] = [];
  if (Array.isArray(candidate.sources)) {
    for (const rawSource of candidate.sources) {
      if (!rawSource || typeof rawSource !== 'object') continue;
      const entry = rawSource as Record<string, unknown>;
      if (typeof entry.id !== 'string' || typeof entry.url !== 'string' || typeof entry.label !== 'string') continue;
      sources.push({ id: entry.id, url: entry.url, label: entry.label });
    }
  }

  return {
    schema_version: typeof candidate.schema_version === 'number' ? candidate.schema_version : 1,
    subject,
    school_year: typeof candidate.school_year === 'string' ? candidate.school_year.trim() : '',
    country: typeof candidate.country === 'string' ? candidate.country.trim() : '',
    description: typeof candidate.description === 'string' ? candidate.description.trim() : '',
    grade_order,
    grade_labels: stringMap(candidate.grade_labels),
    tracks: stringMap(candidate.tracks),
    branches,
    sources,
    nodes,
  };
}

/** Étape du sélecteur de niveaux : un ou plusieurs grades parallèles (ex. terminale spé / complémentaires). */
export type GradeStop = { key: string; label: string; short: string; grades: string[] };

const shortenGradeLabel = (label: string) => {
  if (label.includes(' ')) return label.split(/\s+/)[0];
  return label.length > 6 ? label.slice(0, 4) : label;
};

/** Construit les étapes ordonnées du sélecteur de niveaux (6e → terminale) : les grades de même libellé sont regroupés. */
export function getGradeStops(subject: string, curriculums: CurriculumData[] = CURRICULUMS): GradeStop[] {
  const curriculum = getCurriculumForSubject(subject, curriculums);
  if (!curriculum) return [];
  const stops: GradeStop[] = [];
  for (const grade of curriculum.grade_order) {
    const label = curriculum.grade_labels[grade] ?? grade;
    const previous = stops[stops.length - 1];
    const previousLabel = previous ? curriculum.grade_labels[previous.key] ?? previous.key : null;
    if (previous && previousLabel === label) {
      previous.grades.push(grade);
      continue;
    }
    stops.push({ key: grade, label, short: shortenGradeLabel(label), grades: [grade] });
  }
  return stops;
}

/** Construit l'arbre de progression (thèmes → classes → paquets) d'une matière à partir de son curriculum et des decks locaux. */
export function buildProgression(subject: string, decks: Deck[], curriculums: CurriculumData[] = CURRICULUMS): ProgressionBranch[] | null {
  const curriculum = getCurriculumForSubject(subject, curriculums);
  if (!curriculum) return null;

  const bySyncId = new Map<string, Deck>();
  for (const deck of decks) {
    if (deck.sync_id) bySyncId.set(deck.sync_id, deck);
  }

  const branchIndexByDomain = new Map<string, number>();
  curriculum.branches.forEach((branch, index) => {
    for (const domain of branch.domains) branchIndexByDomain.set(domain, index);
  });

  const branches: ProgressionBranch[] = curriculum.branches.map(({ title }) => ({ title, levels: [] }));
  const matched = new Set<number>();

  for (const grade of curriculum.grade_order) {
    const nodes = curriculum.nodes.filter((node) => node.grade === grade);
    for (const node of nodes) {
      const deck = bySyncId.get(node.deck_id);
      if (!deck) continue;
      const branch = branches[branchIndexByDomain.get(node.domain) ?? -1];
      if (!branch) continue;
      matched.add(deck.id);
      let level = branch.levels.find((entry) => entry.grade === grade);
      if (!level) {
        level = { grade, label: curriculum.grade_labels[grade] ?? grade, tracks: [] };
        branch.levels.push(level);
      }
      const trackLabel = curriculum.tracks[grade] ?? '';
      let track = level.tracks.find((entry) => entry.label === trackLabel);
      if (!track) {
        track = { label: trackLabel, decks: [] };
        level.tracks.push(track);
      }
      track.decks.push({ deck, title: node.title });
    }
  }

  // Paquets hors curriculum (créés par l'utilisateur, non référencés, ou rubrique inconnue).
  const extras = decks.filter((deck) => !matched.has(deck.id));
  if (extras.length) {
    branches[0].levels.push({
      grade: 'autres',
      label: 'Autres paquets',
      tracks: [{ label: '', decks: extras.map((deck) => ({ deck, title: deck.title })) }],
    });
  }

  return branches.filter((branch) => branch.levels.length > 0);
}
