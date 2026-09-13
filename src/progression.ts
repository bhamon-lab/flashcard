import collegeCurriculum from '../curriculum/college-2026-2027.json';
import lyceeCurriculum from '../curriculum/lycee-2026-2027.json';
import type { Deck } from './types';

type CurriculumNode = {
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

/** Feuille de l'arbre : un deck local avec son titre court du curriculum. */
export type ProgressionDeck = { deck: Deck; title: string };

/** Parcours de terminale (spécialité ou maths complémentaires). */
export type ProgressionTrack = { label: string; decks: ProgressionDeck[] };

/** Niveau scolaire dans une branche thématique. */
export type ProgressionLevel = { grade: string; label: string; tracks: ProgressionTrack[] };

/** Branche thématique de l'arbre de progression. */
export type ProgressionBranch = { title: string; levels: ProgressionLevel[] };

const GRADE_LABELS: Record<string, string> = {
  '6e': '6e',
  '5e': '5e',
  '4e': '4e',
  '3e': '3e',
  '2de': '2de',
  '1re-spe': '1re spécialité',
  'term-spe': 'Terminale',
  'term-complementaires': 'Terminale',
};

const TRACK_LABELS: Record<string, string> = {
  'term-spe': 'Spécialité',
  'term-complementaires': 'Maths complémentaires',
};

// Ordre de lecture de la 6e à la terminale, comme dans l'arbre documentaire.
const GRADE_ORDER = ['6e', '5e', '4e', '3e', '2de', '1re-spe', 'term-spe', 'term-complementaires'];

// Branche thématique de chaque rubrique du programme (cf. docs/progression-mathematiques-2026-2027.md).
const DOMAIN_BRANCH: Record<string, number> = {
  nombres: 0,
  algebre: 0,
  proportionnalite: 1,
  fonctions: 1,
  analyse: 1,
  suites: 1,
  geometrie: 2,
  mesures: 2,
  donnees: 3,
  probabilites: 3,
  algorithmique: 4,
};

const BRANCH_TITLES = [
  'Nombres et calcul littéral',
  'Proportionnalité, fonctions et analyse',
  'Géométrie, grandeurs et espace',
  'Statistiques et probabilités',
  'Logique et algorithmique',
];

const NODES: CurriculumNode[] = [
  ...(collegeCurriculum.nodes as CurriculumNode[]),
  ...(lyceeCurriculum.nodes as CurriculumNode[]),
];

/** Construit l'arbre de progression (thèmes → classes → paquets) à partir des decks locaux. */
export function buildMathProgression(decks: Deck[]): ProgressionBranch[] {
  const bySyncId = new Map<string, Deck>();
  for (const deck of decks) {
    if (deck.sync_id) bySyncId.set(deck.sync_id, deck);
  }

  const branches: ProgressionBranch[] = BRANCH_TITLES.map((title) => ({ title, levels: [] }));
  const matched = new Set<number>();

  for (const grade of GRADE_ORDER) {
    const nodes = NODES.filter((node) => node.grade === grade);
    for (const node of nodes) {
      const deck = bySyncId.get(node.deck_id);
      if (!deck) continue;
      matched.add(deck.id);
      const branchIndex = DOMAIN_BRANCH[node.domain];
      const branch = branches[branchIndex];
      let level = branch.levels.find((entry) => entry.grade === grade);
      if (!level) {
        level = { grade, label: GRADE_LABELS[grade] ?? grade, tracks: [] };
        branch.levels.push(level);
      }
      const trackLabel = TRACK_LABELS[grade] ?? '';
      let track = level.tracks.find((entry) => entry.label === trackLabel);
      if (!track) {
        track = { label: trackLabel, decks: [] };
        level.tracks.push(track);
      }
      track.decks.push({ deck, title: node.title });
    }
  }

  // Paquets de maths hors curriculum (créés par l'utilisateur ou non référencés).
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
