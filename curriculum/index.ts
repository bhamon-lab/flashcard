// Registre des curricula : un fichier JSON par matière (commun collège et lycée).
// Pour ajouter une matière : créer `maths.json`-style ici puis l'ajouter à CURRICULUMS.
import type { CurriculumData } from '../src/progression';
import maths from './maths.json';
import anglais from './anglais.json';

export const CURRICULUMS: CurriculumData[] = [maths as CurriculumData, anglais as CurriculumData];
