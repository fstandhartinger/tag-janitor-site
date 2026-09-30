// Simulates the nginx.conf request pipeline (exact locations, the two /guides/
// rewrites with `last` re-lookup, static serving) against the actual file tree,
// so a config regression fails here before it fails on the PaaS.
import assert from 'node:assert/strict';
import test from 'node:test';
import {existsSync, readFileSync, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const files = new Set();
(function walk(dir) {
  for (const e of readdirSync(join(ROOT, dir), {withFileTypes: true})) {
    if (e.name === '.git') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p); else files.add(p);
  }
})('');

// Mirrors nginx.conf: exact locations, then the /guides/ prefix location with
// rewrites (last = re-lookup), then static serving.
function request(uri) {
  let u = uri.split('?')[0];
  for (let guard = 0; guard < 10; guard++) {
    if (u === '/privacy') return exists('privacy.html') ? 200 : 404;
    if (u === '/imprint') return exists('imprint.html') ? 200 : 404;
    if (u === '/healthz') return 200;
    if (u === '/guides') return 301;
    if (u.startsWith('/guides/')) {
      let next = null;
      const m1 = u.match(/^\/guides\/([a-z0-9-]+)\/?$/);
      const m2 = u.match(/^\/guides\/$/);
      if (m1) next = `/guides/${m1[1]}.html`;
      else if (m2) next = '/guides/index.html';
      if (next) { u = next; continue; }
    }
    if (u === '/') return exists('index.html') ? 200 : 404;
    return exists(u.replace(/^\//, '')) ? 200 : 404;
  }
  return 500;
  function exists(p) { return files.has(p); }
}

test('canonical and legal URLs resolve', () => {
  for (const u of ['/', '/index.html', '/privacy', '/privacy.html', '/imprint', '/imprint.html']) {
    assert.equal(request(u), 200, u);
  }
});
test('guide slugs resolve with and without trailing slash', () => {
  for (const slug of ['auditing-zendesk-ticket-tags', 'tags-referenced-by-triggers-views-macros', 'safe-bulk-tag-cleanup']) {
    assert.equal(request(`/guides/${slug}`), 200, slug);
    assert.equal(request(`/guides/${slug}/`), 200, slug + '/');
  }
});
test('guides hub and SEO assets resolve', () => {
  for (const u of ['/guides/', '/robots.txt', '/sitemap.xml', '/llms.txt', '/4ab760cd5aef21fb28b299f6b38601be.txt', '/assets/site.css', '/assets/og.png', '/favicon.svg', '/analytics.js']) {
    assert.equal(request(u), 200, u);
  }
  assert.equal(readFileSync(join(ROOT, '4ab760cd5aef21fb28b299f6b38601be.txt'), 'utf8').trim(), '4ab760cd5aef21fb28b299f6b38601be');
  assert.equal(request('/guides'), 301);
});
test('unknown URLs 404 (no rewrite loops)', () => {
  assert.equal(request('/guides/nope'), 404);
  assert.equal(request('/nope'), 404);
  assert.equal(request('/guides/a/b'), 404);
});
