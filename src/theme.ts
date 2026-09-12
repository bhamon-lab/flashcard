import { Platform } from 'react-native';

// Direction artistique « cahier de maths » :
// papier quadrillé, encre bleue, stylo rouge du correcteur,
// surligneur jaune et tableau vert de la salle de classe.
export const colors = {
  ink: '#1A2238',
  muted: '#6B7390',
  canvas: '#EFEFE9',
  paper: '#FFFFFF',
  blue: '#2F52DA',
  blueSoft: '#DFE5FA',
  red: '#D93A2B',
  redSoft: '#FBE3DE',
  yellow: '#F2C744',
  yellowSoft: '#FBF2CF',
  green: '#1F6C4F',
  greenSoft: '#DCEDE2',
  board: '#22382E',
  boardDeep: '#182A22',
  chalk: '#F1F7EF',
  chalkDim: 'rgba(241, 247, 239, 0.6)',
  grid: 'rgba(26, 34, 56, 0.07)',
  gridChalk: 'rgba(241, 247, 239, 0.08)',
  line: '#E3E4DE',
  white: '#FFFFFF',
};

export const radius = {
  small: 10,
  medium: 16,
  large: 24,
};

// Les énoncés et réponses passent en monospace, comme au tableau.
export const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });
