'use strict';

/*
 * Blog as real pages, so Google can list each article:
 *   /blog          list of articles
 *   /blog/<slug>   one article (title, description, canonical, Open Graph,
 *                  Article structured data)
 * Articles live in blog/articles.json. To add one, add an entry there
 * (slug, title, tag, image, imageAlt, description, body HTML, published).
 */

const fs = require('fs');
const path = require('path');

const SITE = 'https://www.kritsleep.in';
const LOGO = 'https://res.cloudinary.com/djicyjlid/image/upload/e_trim/h_160/f_auto,q_auto/v1776879169/ChatGPT_Image_Apr_22_2026_11_02_34_PM_bossql.png';
const ICON = 'https://res.cloudinary.com/djicyjlid/image/upload/e_trim/c_crop,w_0.44,h_1.0,g_west/e_trim/c_pad,w_512,h_512,b_transparent/f_png/v1776879169/ChatGPT_Image_Apr_22_2026_11_02_34_PM_bossql.png';
const GA_ID = 'G-HH8J1E6G44';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtDate(ymd) {
  const d = new Date(ymd + 'T12:00:00Z');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

function loadArticles() {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'blog', 'articles.json'), 'utf8')); }
  catch (e) { console.error('Blog articles could not be read:', e.message); return []; }
}

const CSS = `
:root{--bg:#060e1c;--card:#0a1628;--line:rgba(47,93,168,.22);--text:#E8EEF9;--muted:#9AABC8;--gold:#C9A84C;--glow:#7FB2FF}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font-family:'DM Sans',system-ui,sans-serif;line-height:1.75;overflow-x:hidden}
a{color:var(--glow)}
.top{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 20px;background:rgba(6,14,28,.92);backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}
.top img{height:34px;display:block}
.top nav{display:flex;gap:18px;font-size:.72rem;letter-spacing:.14em;text-transform:uppercase}
.top nav a{color:var(--muted);text-decoration:none}.top nav a:hover{color:var(--text)}
.shop{padding:9px 16px;border-radius:999px;background:linear-gradient(135deg,#F2D16B,#C9A84C);color:#1a1300!important;font-weight:700}
main{max-width:760px;margin:0 auto;padding:28px 18px 60px}
.crumb{font-size:.78rem;color:var(--muted);margin-bottom:18px}.crumb a{color:var(--muted)}
.tag{display:inline-block;font-size:.66rem;letter-spacing:.2em;text-transform:uppercase;color:var(--gold);margin-bottom:10px}
h1{font-family:'Playfair Display',Georgia,serif;font-size:clamp(1.8rem,5vw,2.6rem);line-height:1.2;margin:0 0 12px}
.meta{font-size:.8rem;color:var(--muted);margin-bottom:22px}
.hero{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:14px;border:1px solid var(--line);background:#030810;margin-bottom:26px}
article p{font-size:1.02rem;color:#D3DCEC;margin:0 0 18px}
article h4{font-family:'Playfair Display',Georgia,serif;font-size:1.3rem;margin:30px 0 8px;color:#F0F4FF}
.cta{margin:36px 0;padding:22px;border-radius:14px;border:1px solid rgba(201,168,76,.35);background:linear-gradient(135deg,rgba(201,168,76,.10),rgba(47,93,168,.10))}
.cta strong{display:block;font-family:'Playfair Display',Georgia,serif;font-size:1.25rem;margin-bottom:6px}
.cta p{margin:0 0 14px;color:var(--muted)}
.btn{display:inline-block;padding:12px 20px;border-radius:999px;background:linear-gradient(135deg,#F2D16B,#C9A84C);color:#1a1300;font-weight:700;font-size:.78rem;letter-spacing:.14em;text-transform:uppercase;text-decoration:none}
.more h2,.list h1{font-family:'Playfair Display',Georgia,serif}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}
.card{display:block;border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--card);text-decoration:none;color:var(--text)}
.card img{width:100%;aspect-ratio:16/10;object-fit:cover;display:block;background:#030810}
.card div{padding:14px 16px}
.card span{font-size:.62rem;letter-spacing:.18em;text-transform:uppercase;color:var(--gold)}
.card b{display:block;font-family:'Playfair Display',Georgia,serif;font-size:1.08rem;line-height:1.35;margin:6px 0}
.card p{margin:0;font-size:.85rem;color:var(--muted);line-height:1.6}
footer{border-top:1px solid var(--line);padding:22px 18px;text-align:center;font-size:.78rem;color:var(--muted)}
footer a{color:var(--muted);margin:0 8px}
@media (max-width:640px){.top nav a:not(.shop){display:none}}
`;

function shell({ title, description, canonical, image, jsonLd, body }) {
  return `<!DOCTYPE html>
<html lang="en-IN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="KRIT">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
${image ? `<meta property="og:image" content="${esc(image)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/png" href="${ICON}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;700&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
<style>${CSS}</style>
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>` : ''}
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}');</script>
</head>
<body>
<header class="top">
  <a href="/" aria-label="KRIT home"><img src="${LOGO}" alt="KRIT" width="96" height="34"></a>
  <nav><a href="/#shop">Pillows</a><a href="/blog">Blog</a><a href="/#about">Our Story</a><a class="shop" href="/#shop">Shop now</a></nav>
</header>
${body}
<footer>
  <div><a href="/">Home</a><a href="/blog">Blog</a><a href="/privacy">Privacy Policy</a><a href="/terms">Terms of Use</a></div>
  <div style="margin-top:8px">© ${new Date().getFullYear()} Kritniv Enterprises · Bengaluru · hello@kritsleep.in</div>
</footer>
</body>
</html>`;
}

function card(a) {
  return `<a class="card" href="/blog/${esc(a.slug)}"><img src="${esc(a.image)}" alt="${esc(a.imageAlt)}" loading="lazy"><div><span>${esc(a.tag)}</span><b>${esc(a.title)}</b><p>${esc(a.description)}</p></div></a>`;
}

function renderArticle(a, all) {
  const url = `${SITE}/blog/${a.slug}`;
  const others = all.filter((x) => x.slug !== a.slug);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: a.title,
    description: a.description,
    image: a.image,
    datePublished: a.published,
    dateModified: a.updated || a.published,
    mainEntityOfPage: url,
    author: { '@type': 'Organization', name: 'KRIT' },
    publisher: { '@type': 'Organization', name: 'KRIT', logo: { '@type': 'ImageObject', url: ICON } }
  };
  const body = `<main>
  <div class="crumb"><a href="/">Home</a> › <a href="/blog">Blog</a> › ${esc(a.tag)}</div>
  <span class="tag">${esc(a.tag)}</span>
  <h1>${esc(a.title)}</h1>
  <div class="meta">By KRIT · ${esc(fmtDate(a.published))}</div>
  <img class="hero" src="${esc(a.image)}" alt="${esc(a.imageAlt)}">
  <article>${a.body}</article>
  <div class="cta"><strong>Sleep on natural latex</strong><p>GOLS-certified natural latex pillows in four shapes, with free delivery across India and 7-day returns.</p><a class="btn" href="/#shop">See the pillows</a></div>
  ${others.length ? `<section class="more"><h2>More from the blog</h2><div class="cards">${others.map(card).join('')}</div></section>` : ''}
</main>`;
  return shell({ title: `${a.title} | KRIT Blog`, description: a.description, canonical: url, image: a.image, jsonLd, body });
}

function renderIndex(all) {
  const body = `<main class="list">
  <div class="crumb"><a href="/">Home</a> › Blog</div>
  <span class="tag">KRIT Blog</span>
  <h1>Sleep better, live better</h1>
  <p style="color:var(--muted);margin:0 0 26px">Guides on natural latex, pillow height and healthy sleep from the KRIT team.</p>
  <div class="cards">${all.map(card).join('')}</div>
</main>`;
  return shell({
    title: 'KRIT Blog — natural latex and better sleep',
    description: 'Guides on natural latex pillows, choosing the right pillow height and building a bedroom for deeper sleep.',
    canonical: `${SITE}/blog`,
    image: all[0] && all[0].image,
    jsonLd: { '@context': 'https://schema.org', '@type': 'Blog', name: 'KRIT Blog', url: `${SITE}/blog` },
    body
  });
}

function blogRoutes(app, guard) {
  app.get(['/blog', '/blog/'], guard, (_req, res) => {
    res.set('Cache-Control', 'public, max-age=300');
    res.type('html').send(renderIndex(loadArticles()));
  });
  app.get('/blog/:slug', guard, (req, res, next) => {
    const all = loadArticles();
    const a = all.find((x) => x.slug === req.params.slug);
    if (!a) return next();
    res.set('Cache-Control', 'public, max-age=300');
    res.type('html').send(renderArticle(a, all));
  });
}

function blogSitemapUrls() {
  return [{ loc: `${SITE}/blog`, priority: '0.7', freq: 'weekly' }]
    .concat(loadArticles().map((a) => ({ loc: `${SITE}/blog/${a.slug}`, priority: '0.7', freq: 'monthly' })));
}

module.exports = { blogRoutes, blogSitemapUrls, loadArticles };
