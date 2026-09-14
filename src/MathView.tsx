import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from './theme';

export { stripMathText } from './mathText';

const KATEX_VERSION = '0.16.22';
const CDN = `https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist`;

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function buildMathHtml(text: string, fontSize: number, color: string, instanceId: string) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="${CDN}/katex.min.css">
<script defer src="${CDN}/katex.min.js"></script>
<script defer src="${CDN}/contrib/auto-render.min.js"></script>
<style>
  html, body { margin: 0; padding: 0; background: transparent; width: 100%; overflow: hidden; }
  #content {
    width: 100%; box-sizing: border-box; padding: 4px 6px;
    font-family: -apple-system, 'Segoe UI', Roboto, sans-serif;
    font-size: ${fontSize}px; line-height: 1.5; color: ${color};
    text-align: center; white-space: pre-wrap; word-break: break-word;
  }
  .katex { font-size: 1.12em; }
  .katex-display { margin: 0.35em 0; }
  .katex-display > .katex { white-space: normal; }
</style>
</head>
<body>
<div id="content">${escapeHtml(text)}</div>
<script>
  (function () {
    var instanceId = ${JSON.stringify(instanceId)};
    var reportedHeight = 0;
    function report() {
      var el = document.getElementById('content');
      if (!el) return;
      var height = Math.ceil(el.getBoundingClientRect().height);
      if (height <= 0 || Math.abs(height - reportedHeight) <= 1) return;
      reportedHeight = height;
      var payload = JSON.stringify({ id: instanceId, height: height });
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(payload);
      else if (window.parent && window.parent !== window) window.parent.postMessage(payload, '*');
    }
    function render() {
      try {
        if (window.renderMathInElement) {
          renderMathInElement(document.getElementById('content'), {
            delimiters: [
              { left: '$$', right: '$$', display: true },
              { left: '$', right: '$', display: false },
            ],
            throwOnError: false,
          });
        }
      } catch (error) {}
      requestAnimationFrame(function () { setTimeout(report, 20); });
    }
    window.addEventListener('load', function () { setTimeout(render, 10); });
    requestAnimationFrame(report);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { setTimeout(report, 40); });
    }
    setTimeout(render, 2500);
    window.addEventListener('resize', report);
  })();
</script>
</body>
</html>`;
}

type MathViewProps = {
  text: string;
  fontSize?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
};

function useMathInstance(text: string, fontSize: number, color: string) {
  const instanceId = useRef(`mv-${Math.random().toString(36).slice(2)}`).current;
  const [height, setHeight] = useState(0);
  const html = useMemo(() => buildMathHtml(text, fontSize, color, instanceId), [text, fontSize, color, instanceId]);
  useEffect(() => { setHeight(0); }, [html]);
  return { instanceId, height, setHeight, html };
}

function NativeMathView({ text, fontSize = 18, color = colors.ink, style }: MathViewProps) {
  const { height, setHeight, html } = useMathInstance(text, fontSize, color);
  const onMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data) as { height?: number };
      if (typeof data.height === 'number' && data.height > 0) setHeight(Math.ceil(data.height));
    } catch {}
  }, [setHeight]);
  if (!text.trim()) return null;
  return (
    <View pointerEvents="none" style={[styles.container, style]}>
      <WebView
        source={{ html, baseUrl: 'https://cdn.jsdelivr.net' }}
        style={[styles.webView, { height: height || 44, opacity: height ? 1 : 0 }]}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        cacheEnabled={false}
        onMessage={onMessage}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

function WebMathView({ text, fontSize = 18, color = colors.ink, style }: MathViewProps) {
  const { instanceId, height, setHeight, html } = useMathInstance(text, fontSize, color);
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (typeof event.data !== 'string') return;
      try {
        const data = JSON.parse(event.data) as { id?: string; height?: number };
        if (data.id === instanceId && typeof data.height === 'number' && data.height > 0) {
          setHeight(Math.ceil(data.height));
        }
      } catch {}
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [instanceId, setHeight]);
  if (!text.trim()) return null;
  // react-native-webview ne supporte pas le web : on utilise une iframe du DOM.
  const iframe = React.createElement('iframe', {
    srcDoc: html,
    style: {
      display: 'block',
      width: '100%',
      height: height || 44,
      border: 'none',
      opacity: height ? 1 : 0,
      backgroundColor: 'transparent',
      pointerEvents: 'none',
    },
  });
  return <View pointerEvents="none" style={[styles.container, style]}>{iframe}</View>;
}

export function MathView(props: MathViewProps) {
  return Platform.OS === 'web' ? <WebMathView {...props} /> : <NativeMathView {...props} />;
}

const styles = StyleSheet.create({
  container: { width: '100%' },
  webView: { backgroundColor: 'transparent' },
});
