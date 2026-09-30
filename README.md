# tag-janitor-site

Static site for Tag Janitor, a Zendesk Support app by productivity-boost.com
Betriebs UG (haftungsbeschränkt) & Co. KG. Serves the landing page, practical guides,
privacy policy and imprint that the Zendesk Marketplace listing links to.

Deployed on the Sandy PaaS at https://tag-janitor.app.mintapis.com — the
listing's privacy URL points here, so this site must stay up as long as the
app is listed.

## Structure

- `index.html` — landing page (marketing, FAQ, schema)
- `guides/` — practical guides on Zendesk ticket tag hygiene
- `privacy.html` / `imprint.html` — legal pages (kept reachable at `/privacy` and `/imprint` too)
- `analytics.js` — privacy-controlled pageview tracker (fixed public payload, DNT/GPC opt-out)
- `assets/site.css`, `assets/og.svg` / `assets/og.png`, `favicon.svg` — styles, vector source + social card, icon
- `robots.txt`, `sitemap.xml`, `llms.txt`, `4ab760cd5aef21fb28b299f6b38601be.txt` — SEO/machine-readability and the public IndexNow verification key
- `test/analytics.test.mjs` — node:test suite for the analytics wrapper
- `Dockerfile`, `nginx.conf` — nginx:1.27-alpine static server

## Checks

```sh
node --test test/analytics.test.mjs
node assets/checks.mjs
```

## Deploy

Rebuild the PaaS app from this repository (no build step needed; the Dockerfile copies the
static files). After deploy, verify `https://tag-janitor.app.mintapis.com/healthz` and the
sitemap.
