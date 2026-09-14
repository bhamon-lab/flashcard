const GREEK: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', theta: 'θ', lambda: 'λ',
  mu: 'μ', pi: 'π', sigma: 'σ', phi: 'φ', omega: 'ω', Delta: 'Δ', Omega: 'Ω', Pi: 'π',
};

/** Version texte brut d'une chaîne contenant du LaTeX, pour les listes compactes. */
export function stripMathText(input: string): string {
  if (!input) return '';
  const group = '\\{((?:[^{}]|\\{[^{}]*\\})*)\\}';
  const fracRegex = new RegExp(`\\\\[dt]?frac${group}${group}`, 'g');
  const compact = (value: string) => (value.length <= 1 || /^[A-Za-z0-9√π]+$/.test(value) ? value : `(${value})`);
  let text = input
    .replace(/\$\$([\s\S]*?)\$\$/g, '$1')
    .replace(/\$([^$]*?)\$/g, '$1')
    .replace(/\\left|\\right/g, '')
    .replace(/\\[bB]igg?[lr]/g, '')
    .replace(/\\sqrt/g, '√')
    .replace(/\\,|\\;|\\:|\\!/g, ' ');
  for (let previous = ''; previous !== text;) {
    previous = text;
    text = text.replace(fracRegex, (_, numerator: string, denominator: string) => `${compact(numerator)}/${compact(denominator)}`);
  }
  return text
    .replace(/\\cdot|\\times/g, '×')
    .replace(/\\neq|\\ne/g, '≠')
    .replace(/\\leq/g, '≤')
    .replace(/\\geq/g, '≥')
    .replace(/\\approx/g, '≈')
    .replace(/\\pm/g, '±')
    .replace(/\\infty/g, '∞')
    .replace(/\\([a-zA-Z]+)/g, (match, name: string) => GREEK[name] ?? name)
    .replace(/\^\{([^{}]*)\}/g, (_, value: string) => (/^[A-Za-z0-9]+$/.test(value) ? `^${value}` : `^(${value})`))
    .replace(/_\{([^{}]*)\}/g, (_, value: string) => (/^[A-Za-z0-9]+$/.test(value) ? `_${value}` : `_(${value})`))
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
