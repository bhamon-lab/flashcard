import fs from "node:fs";
import path from "node:path";

const distDir = path.join(process.cwd(), "dist");
const indexPath = path.join(distDir, "index.html");

if (!fs.existsSync(indexPath)) {
  throw new Error(`Fichier introuvable : ${indexPath}. Lance « expo export » d'abord.`);
}

let html = fs.readFileSync(indexPath, "utf8");

const headTags = [
  '<link rel="manifest" href="/manifest.json"/>',
  '<meta name="theme-color" content="#DFE5FA"/>',
  '<meta name="mobile-web-app-capable" content="yes"/>',
  '<meta name="apple-mobile-web-app-capable" content="yes"/>',
  '<meta name="apple-mobile-web-app-status-bar-style" content="default"/>',
  '<meta name="apple-mobile-web-app-title" content="Réviz’"/>',
  '<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png"/>',
];

for (const tag of headTags) {
  if (!html.includes(tag)) {
    html = html.replace("</head>", `  ${tag}\n  </head>`);
  }
}

if (!html.includes("serviceWorker.register")) {
  html = html.replace(
    "</body>",
    [
      '  <script>',
      '    if ("serviceWorker" in navigator) {',
      '      window.addEventListener("load", function () {',
      '        navigator.serviceWorker.register("/sw.js").catch(function () {});',
      "      });",
      "    }",
      "  </script>",
      "</body>",
    ].join("\n")
  );
}

fs.writeFileSync(indexPath, html);
console.log("PWA : manifest, icônes et service worker injectés dans dist/index.html");
