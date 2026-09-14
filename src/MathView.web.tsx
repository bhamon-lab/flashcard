import katex from 'katex';
import React, { useMemo } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import { colors } from './theme';

export { stripMathText } from './mathText';

type MathViewProps = {
  text: string;
  fontSize?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
};

const KATEX_CSS = 'https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css';

const escapeHtml = (text: string) => text
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

/** Rend le texte et ses segments $...$ directement, sans iframe ni script distant. */
function renderMathText(text: string): string {
  const delimiters = /\$\$([\s\S]*?)\$\$|\$([^$\n]*?)\$/g;
  let html = '';
  let cursor = 0;

  for (const match of text.matchAll(delimiters)) {
    const index = match.index ?? 0;
    html += escapeHtml(text.slice(cursor, index));
    html += katex.renderToString(match[1] ?? match[2], {
      displayMode: match[1] !== undefined,
      throwOnError: false,
      output: 'htmlAndMathml',
    });
    cursor = index + match[0].length;
  }

  return html + escapeHtml(text.slice(cursor));
}

export function MathView({ text, fontSize = 18, color = colors.ink, style }: MathViewProps) {
  const html = useMemo(() => renderMathText(text), [text]);
  if (!text.trim()) return null;

  return React.createElement(
    React.Fragment,
    null,
    React.createElement('link', { rel: 'stylesheet', href: KATEX_CSS, precedence: 'default' }),
    React.createElement('div', {
      dangerouslySetInnerHTML: { __html: html },
      style: {
        boxSizing: 'border-box',
        width: '100%',
        padding: '4px 6px',
        color,
        fontFamily: "-apple-system, 'Segoe UI', Roboto, sans-serif",
        fontSize,
        lineHeight: 1.5,
        overflowWrap: 'break-word',
        textAlign: 'center',
        whiteSpace: 'pre-wrap',
        ...(style as React.CSSProperties),
      },
    }),
  );
}
