// Static checks for the Tag Janitor site. Run: node assets/checks.mjs
// Checks: URL/file integrity, metadata + schema consistency, accessible names,
// contrast of the declared palettes, robots/sitemap/llms consistency, and that
// the analytics wrapper's page list is not expanded (guides stay unmeasured).
import {readFileSync, readdirSync, statSync} from 'node:fs';
import {dirname, join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://tag-janitor.app.mintapis.com';
const failures = [];
const passes = [];
function ok(name) { passes.push(name); }
function bad(name, detail) { failures.push(`${name}: ${detail}`); }
function read(p) { return readFileSync(join(ROOT, p), 'utf8'); }
function exists(p) { try { statSync(join(ROOT, p)); return true; } catch { return false; } }

// ---- canonical URL -> repo file map (mirrors nginx.conf) ----
const files = [];
(function walk(dir) {
  for (const e of readdirSync(join(ROOT, dir), {withFileTypes: true})) {
    if (e.name === '.git') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else files.push(p);
  }
})('');
const htmlFiles = files.filter(f => f.endsWith('.html') && !f.startsWith('test'));

// IndexNow proof file: one root-level 32-hex key whose filename and contents match.
const indexNowKeys = files.filter(f => /^[a-f0-9]{32}\.txt$/.test(f));
if (indexNowKeys.length !== 1) bad('indexnow', `expected one root 32-hex proof file, found ${indexNowKeys.length}`);
else if (read(indexNowKeys[0]).trim() !== indexNowKeys[0].slice(0, -4)) bad('indexnow', 'proof filename and contents differ');
else if (!read('Dockerfile').includes(indexNowKeys[0])) bad('indexnow', 'Dockerfile does not copy the root proof file');
else ok('indexnow: root key filename/content match and Dockerfile serves it');

const urlToPath = {};
function mapUrl(url, p) { urlToPath[url] = p; }
mapUrl('/', 'index.html'); mapUrl('/index.html', 'index.html');
mapUrl('/privacy.html', 'privacy.html'); mapUrl('/privacy', 'privacy.html');
mapUrl('/imprint.html', 'imprint.html'); mapUrl('/imprint', 'imprint.html');
mapUrl('/guides/', 'guides/index.html');
for (const f of files.filter(f => f.startsWith('guides/') && f.endsWith('.html') && f !== 'guides/index.html')) {
  const slug = f.replace('guides/', '').replace(/\.html$/, '');
  mapUrl(`/guides/${slug}`, `guides/${slug}.html`);
  mapUrl(`/guides/${slug}/`, `guides/${slug}.html`);
}
for (const f of files.filter(f => !f.startsWith('test/') && !f.startsWith('assets/checks.mjs'))) {
  mapUrl('/' + f, f);
}
for (const [url, p] of Object.entries(urlToPath)) {
  if (!exists(p)) bad('url-file', `canonical ${url} maps to missing file ${p}`);
}

// ---- per-page metadata + link integrity ----
const expectCanonical = {};
expectCanonical['index.html'] = `${ORIGIN}/`;
expectCanonical['privacy.html'] = `${ORIGIN}/privacy.html`;
expectCanonical['imprint.html'] = `${ORIGIN}/imprint.html`;
expectCanonical['guides/index.html'] = `${ORIGIN}/guides/`;
for (const f of files.filter(f => f.startsWith('guides/') && f.endsWith('.html') && f !== 'guides/index.html')) {
  expectCanonical[f] = `${ORIGIN}/guides/${f.replace('guides/', '').replace(/\.html$/, '')}/`;
}

const extAllowed = [/(^|\.)zendesk\.com$/, /(^|\.)ec\.europa\.eu$/];
for (const f of htmlFiles) {
  const html = read(f);
  const page = f.replace(/\.html$/, f === 'index.html' ? '' : '');
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1];
  if (!title) bad(`title:${f}`, 'missing <title>');
  else if (title.length < 10 || title.length > 70) bad(`title:${f}`, `length ${title.length} not in 10..70`);
  const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1];
  if (!desc) bad(`description:${f}`, 'missing meta description');
  else if (desc.length < 50 || desc.length > 170) bad(`description:${f}`, `length ${desc.length} not in 50..170`);
  const canon = (html.match(/<link rel="canonical" href="([^"]*)"/) || [])[1];
  if (canon !== expectCanonical[f]) bad(`canonical:${f}`, `got ${canon}, want ${expectCanonical[f]}`);
  const ogUrl = (html.match(/<meta property="og:url" content="([^"]*)"/) || [])[1];
  if (ogUrl && ogUrl !== expectCanonical[f]) bad(`og:url:${f}`, `got ${ogUrl}, want ${expectCanonical[f]}`);
  if (!/<meta property="og:image" content="[^"]*og\.png"/.test(html)) bad(`og:image:${f}`, 'missing og.png image');

  // JSON-LD blocks
  const ldBlocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  for (const m of ldBlocks) {
    try { JSON.parse(m[1]); } catch (e) { bad(`jsonld:${f}`, `parse error: ${e.message}`); }
  }
  // FAQPage parity with visible FAQ
  if (f === 'index.html') {
    const faq = ldBlocks.map(m => { try { return JSON.parse(m[1]); } catch { return null; } })
      .find(x => x && x['@type'] === 'FAQPage');
    if (!faq) bad('faq:jsonld', 'no FAQPage block');
    else {
      const jsonQs = faq.mainEntity.map(q => q.name);
      const visQs = [...html.matchAll(/<summary>([^<]*)<\/summary>/g)].map(m => m[1].trim());
      const a = new Set(jsonQs), b = new Set(visQs);
      if (a.size !== b.size || [...a].some(q => !b.has(q))) {
        bad('faq:parity', `jsonld ${[...a]} vs visible ${[...b]}`);
      } else ok('faq: jsonld matches visible FAQ');
      if (faq.mainEntity.some(q => !q.acceptedAnswer || !q.acceptedAnswer.text)) bad('faq:answers', 'empty acceptedAnswer');
    }
    const app = ldBlocks.map(m => { try { return JSON.parse(m[1]); } catch { return null; } })
      .find(x => x && x['@type'] === 'SoftwareApplication');
    if (!app) bad('schema:app', 'no SoftwareApplication block');
    else {
      if (app.url !== expectCanonical['index.html']) bad('schema:app.url', app.url);
      const mkt = 'https://www.zendesk.com/marketplace/apps/support/1288247/tag-janitor/';
      if (app.installUrl !== mkt) bad('schema:installUrl', app.installUrl);
      if (!html.includes(`href="${mkt}"`)) bad('schema:installUrl', 'marketplace URL not present in body');
    }
    const product = ldBlocks.map(m => { try { return JSON.parse(m[1]); } catch { return null; } })
      .find(x => x && x['@type'] === 'Product');
    if (!product) bad('schema:product', 'no Product block');
    else if (product.url !== expectCanonical['index.html']) bad('schema:product.url', product.url);
  }

  // link integrity
  const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(m => m[1]);
  for (const ref of refs) {
    if (/^(mailto:|tel:|javascript:)/.test(ref) || ref === '#') continue;
    const clean = ref.split('#')[0];
    if (!clean) continue;
    if (clean.startsWith('http://') || clean.startsWith('https://')) {
      if (clean.startsWith(ORIGIN)) {
        const u = new URL(clean);
        if (!urlToPath[u.pathname]) bad(`link:${f}`, `own URL not in site map: ${clean}`);
      } else {
        const host = new URL(clean).hostname;
        if (!extAllowed.some(re => re.test(host))) {
          bad(`link:${f}`, `unexpected external host: ${clean}`);
        } else {
          const tag = [...html.matchAll(new RegExp(`<a\\b[^>]*href="${clean.replace(/[.*+?^${}()|[\]\\]/g, '\\\\$&')}"[^>]*>`, 'g'))][0];
          if (tag && !/target="_blank"/.test(tag[0]) && !/rel="[^"]*noopener/.test(tag[0])) {
            bad(`link:${f}`, `external link lacks target=_blank rel=noopener: ${clean}`);
          }
        }
      }
      continue;
    }
    const u = new URL(clean, `${ORIGIN}/${f === 'index.html' ? '' : f}`);
    if (!urlToPath[u.pathname]) bad(`link:${f}`, `local link not in site map: ${ref}`);
  }

  // accessible names
  for (const m of html.matchAll(/<img\b([^>]*)>/g)) {
    if (!/alt="[^"]{3,}"/.test(m[1])) bad(`a11y:img:${f}`, m[0].slice(0, 80));
  }
  const unlabeledSvgs = [...html.matchAll(/<svg\b([^>]*)>/g)].filter(m =>
    !/aria-hidden/.test(m[1]) && !/role="img"/.test(m[1]) && !/aria-label/.test(m[1]));
  if (unlabeledSvgs.length) bad(`a11y:svg:${f}`, `${unlabeledSvgs.length} svg without aria-hidden/label`);
  for (const m of html.matchAll(/<a\b([^>]*)>\s*<\/a>/g)) bad(`a11y:link:${f}`, 'empty link');
  for (const m of html.matchAll(/<(button|input|select|textarea)\b([^>]*)>/g)) {
    if (!/aria-label|placeholder/.test(m[2])) bad(`a11y:control:${f}`, m[0].slice(0, 80));
  }
  if (f === 'index.html') {
    if (!/class="skip"/.test(html)) bad('a11y:skip', 'no skip link');
    if (!/<html lang="en">/.test(html)) bad('a11y:lang', 'html lang missing');
  }
}
if (!failures.length) ok('metadata: titles, descriptions, canonical, og, schema, links, a11y names');

// ---- robots / sitemap / llms ----
const robots = read('robots.txt');
if (!/Sitemap:\s*https:\/\/tag-janitor\.app\.mintapis\.com\/sitemap\.xml/.test(robots)) bad('robots', 'missing/incorrect Sitemap line');
const sitemap = read('sitemap.xml');
for (const m of sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)) {
  const u = new URL(m[1]);
  if (!u.origin.startsWith(ORIGIN)) bad('sitemap', `wrong origin ${m[1]}`);
  else if (!urlToPath[u.pathname]) bad('sitemap', `URL not in site map: ${m[1]}`);
}
const sitemapLocs = [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map(m => m[1]);
if (!sitemapLocs.includes(`${ORIGIN}/privacy.html`)) bad('sitemap', 'privacy URL missing (listing dependency)');
if (!sitemapLocs.includes(`${ORIGIN}/imprint.html`)) bad('sitemap', 'imprint URL missing');
const llms = read('llms.txt');
if (!llms.includes('Tag Janitor')) bad('llms', 'does not name the app');

// ---- contrast of declared palettes ----
function lum([r, g, b]) {
  const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function ratio(a, b) { const [hi, lo] = [Math.max(lum(a), lum(b)), Math.min(lum(a), lum(b))]; return (hi + 0.05) / (lo + 0.05); }
const css = read('assets/site.css');
function palette(block) {
  const vars = {};
  for (const m of block.matchAll(/--([a-z0-9-]+):\s*#([0-9a-f]{6})/gi)) {
    vars[m[1]] = [0, 2, 4].map(i => parseInt(m[2].slice(i, i + 2), 16));
  }
  return vars;
}
const lightBlock = css.slice(css.indexOf(':root{'), css.indexOf('}@media (prefers-color-scheme:dark)'));
const darkBlock = css.slice(css.indexOf('@media (prefers-color-scheme:dark)'), css.indexOf('}}', css.indexOf('@media (prefers-color-scheme:dark)')));
for (const [name, p] of [['light', palette(lightBlock)], ['dark', palette(darkBlock)]]) {
  const cases = [
    ['text on bg', p.text, p.bg, 4.5],
    ['text-2 on bg', p['text-2'], p.bg, 4.5],
    ['text-2 on surface', p['text-2'], p.surface, 4.5],
    ['muted on bg', p.muted, p.bg, 4.5],
    ['accent on bg', p.accent, p.bg, 4.5],
    ['accent on accent-soft', p.accent, p['accent-soft'], 4.5],
    ['accent-ink on accent', p['accent-ink'], p.accent, 4.5],
    ['danger on bg', p.danger, p.bg, 4.5],
    ['warn on warn-soft', p.warn, p['warn-soft'], 4.5],
  ];
  for (const [label, fg, bg, min] of cases) {
    const r = ratio(fg, bg);
    if (r < min) bad(`contrast:${name}`, `${label} ${r.toFixed(2)} < ${min}`);
  }
  ok(`contrast: ${name} palette (${cases.length} pairs >= 4.5)`);
}
if (!/:focus-visible\s*\{/.test(css)) bad('a11y:focus', 'no :focus-visible rule in site.css');

// ---- analytics wrapper: fixed routes, guides excluded ----
const an = read('analytics.js');
const anPages = an.match(/const pages = \{[\s\S]*?\n\};/);
if (!anPages) bad('analytics', 'pages map not found');
else {
  const anText = anPages[0];
  for (const p of ['"/"', '"/privacy"', '"/imprint"']) if (!anText.includes(p)) bad('analytics', `missing route ${p}`);
  for (const p of ['/guides', 'guides/']) if (anText.includes(p)) bad('analytics', `analytics extended to ${p}`);
  if (!an.includes('doNotTrackEnabled')) bad('analytics', 'DNT gate missing');
  if (!an.includes('globalPrivacyControl')) bad('analytics', 'GPC gate missing');
  ok('analytics: fixed public routes only (guides unmeasured), DNT/GPC gates intact');
}

// ---- report ----
console.log(`PASS ${passes.length}`);
for (const p of passes) console.log('  ✓ ' + p);
if (failures.length) {
  console.log(`FAIL ${failures.length}`);
  for (const f of failures) console.log('  ✗ ' + f);
  process.exit(1);
}
console.log('all checks passed');
