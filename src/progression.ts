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
export function getCurriculumForSubject(subject: string): CurriculumData | null {
  const needle = subject.trim().toLowerCase();
  return CURRICULUMS.find((entry) => entry.subject.trim().toLowerCase() === needle) ?? null;
}

/** Étape du sélecteur de niveaux : un ou plusieurs grades parallèles (ex. terminale spé / complémentaires). */
export type GradeStop = { key: string; label: string; short: string; grades: string[] };

const shortenGradeLabel = (label: string) => {
  if (label.includes(' ')) return label.split(/\s+/)[0];
  return label.length > 6 ? label.slice(0, 4) : label;
};

/** Construit les étapes ordonnées du sélecteur de niveaux (6e → terminale) : les grades de même libellé sont regroupés. */
export function getGradeStops(subject: string): GradeStop[] {
  const curriculum = getCurriculumForSubject(subject);
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
export function buildProgression(subject: string, decks: Deck[]): ProgressionBranch[] | null {
  const curriculum = getCurriculumForSubject(subject);
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
