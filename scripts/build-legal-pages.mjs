// ─── GENERATE THE LEGAL PAGES ────────────────────────────────────────────────
// Writes website/privacy.html and website/terms.html from src/core/legal/policy.js.
//
// The app renders that same module directly, so this script is what makes
// "uniform across platforms" a property rather than a promise. Run it after any
// edit to the policy; tests/legal.test.js fails if the committed HTML does not
// match what this produces, so forgetting to run it is caught rather than
// shipped.
//
//   node scripts/build-legal-pages.mjs           write the files
//   node scripts/build-legal-pages.mjs --check   exit 1 if they are stale

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { DOCUMENTS, EFFECTIVE_DATE, CONTACT_EMAIL } from '../src/core/legal/policy.js';

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const STYLE = readFileSync(new URL('./legal-page.css', import.meta.url), 'utf8');

export const render = (key) => {
  const doc = DOCUMENTS[key];
  const desc = key === 'privacy'
    ? 'No account, no tracking. Almost everything SparkConnect stores stays on your phone. Here is exactly what leaves it, and where it goes.'
    : 'SparkConnect is a reference tool, not an inspector. The terms, plainly stated.';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(doc.title)} | SparkConnect</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="https://sparkconnect.pro${doc.path}">
<meta name="theme-color" content="#080B11">
<style>
${STYLE}</style>
</head>
<body>
<nav class="nav"><div class="wrap nav__in">
  <a class="brand" href="/">
    <span class="bolt" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 24 24" fill="#fff"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z"/></svg></span>
    SparkConnect
  </a>
  <a class="btn btn--primary" href="/#get">Get the app</a>
</div></nav>
<main><div class="wrap">

  <p class="crumb"><a href="/">Home</a> / ${esc(doc.title)}</p>
  <h1>${esc(doc.title)}</h1>
  <p class="updated">Last updated ${esc(EFFECTIVE_DATE)}</p>

  <div class="prose">
    <div class="card ${key === 'privacy' ? 'card--ok' : 'card--hi'}">
      <span class="k">${key === 'privacy' ? 'THE SHORT VERSION' : 'READ THIS PART IF YOU READ NOTHING ELSE'}</span>
      <p style="color:var(--text)">${esc(doc.summary)}</p>
    </div>

${doc.sections.map((s) => `    <h2>${esc(s.title)}</h2>
    <p>${esc(s.body)}</p>`).join('\n\n')}

    <h2>Contact</h2>
    <p><a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></p>
  </div>

</div></main>
<footer class="foot"><div class="wrap">
  <p>SparkConnect is not the authority having jurisdiction. Nothing in the app or on this site
  is a substitute for the adopted code, approved plans, or your inspector.</p>
  <p style="margin-top:12px"><a href="/">&larr; SparkConnect</a> &nbsp;·&nbsp;
  <a href="/privacy">Privacy</a> &nbsp;·&nbsp; <a href="/terms">Terms</a></p>
</div></footer>
</body>
</html>
`;
};

const TARGETS = { privacy: 'website/privacy.html', terms: 'website/terms.html' };

if (import.meta.url === `file://${process.argv[1]}`) {
  const check = process.argv.includes('--check');
  let stale = [];
  for (const [key, path] of Object.entries(TARGETS)) {
    const html = render(key);
    if (check) {
      const current = existsSync(path) ? readFileSync(path, 'utf8') : '';
      if (current !== html) stale.push(path);
    } else {
      writeFileSync(path, html);
      console.log(`wrote ${path}  (${html.length} bytes)`);
    }
  }
  if (check) {
    if (stale.length) {
      console.error(`STALE: ${stale.join(', ')}\nRun: node scripts/build-legal-pages.mjs`);
      process.exit(1);
    }
    console.log('legal pages are in sync with src/core/legal/policy.js');
  }
}
