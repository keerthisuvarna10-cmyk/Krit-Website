const express = require('express');
const session = require('express-session');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || (IS_PRODUCTION ? '' : 'Kritniv');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (IS_PRODUCTION ? '' : 'Kritniv');
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const ACCESS_CONFIGURED = Boolean(ADMIN_USERNAME && ADMIN_PASSWORD);
const ERP_BASE_URL = String(process.env.ERP_BASE_URL || '').replace(/\/$/, '');
const ERP_WEBHOOK_SECRET = process.env.ERP_WEBHOOK_SECRET || '';

app.set('trust proxy', 1);
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(session({
  name: 'krit.sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 12
  }
}));

function renderLogin(errorText = '') {
  const errorBlock = errorText
    ? `<div style="margin-bottom:18px;padding:12px 14px;border-radius:14px;background:rgba(229,57,53,.1);border:1px solid rgba(229,57,53,.28);color:#ffb4b4;font-size:.92rem;line-height:1.6">${errorText}</div>`
    : '';
  const hintText = ACCESS_CONFIGURED
    ? (IS_PRODUCTION
        ? 'Access credentials are configured through Railway environment variables.'
        : `Current local access: <strong>${ADMIN_USERNAME}</strong> / <strong>${ADMIN_PASSWORD}</strong>. Change these with environment variables before going live.`)
    : 'Access is not configured yet. Set ADMIN_USERNAME and ADMIN_PASSWORD in Railway before deploying this site publicly.';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>KRIT Access</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
    :root{--bg:#050b14;--panel:#091525;--panel2:#0d1b30;--line:rgba(255,255,255,.08);--text:#f0f4ff;--muted:#9cb0d0;--gold:#f9d548;--blue:#2f5da8}
    *{box-sizing:border-box} html,body{margin:0;padding:0;font-family:'DM Sans',sans-serif;background:radial-gradient(circle at top left, rgba(47,93,168,.18), transparent 28%),radial-gradient(circle at bottom right, rgba(249,213,72,.12), transparent 26%),var(--bg);color:var(--text);min-height:100%}
    body{display:flex;align-items:center;justify-content:center;padding:24px}
    .shell{width:min(980px,100%);display:grid;grid-template-columns:minmax(300px,.92fr) minmax(380px,1.08fr);background:linear-gradient(180deg,var(--panel) 0%, #08111f 100%);border:1px solid var(--line);border-radius:28px;overflow:hidden;box-shadow:0 40px 90px rgba(0,0,0,.45)}
    .side{padding:42px 36px;background:radial-gradient(circle at top left, rgba(249,213,72,.16), transparent 34%),radial-gradient(circle at bottom right, rgba(43,125,233,.16), transparent 34%),linear-gradient(180deg,var(--panel2),#08111f)}
    .logo{width:148px;display:block;margin-bottom:22px}
    .eyebrow{font-size:.76rem;letter-spacing:.24em;text-transform:uppercase;color:#9fc0ff;margin-bottom:16px}
    h1{font-family:'Playfair Display',serif;font-size:2.65rem;line-height:1.02;margin:0 0 16px}
    .copy{font-size:1rem;line-height:1.8;color:#bfd0eb;max-width:34ch}
    .benefits{display:grid;gap:10px;margin-top:24px}
    .benefit{padding:14px 16px;border-radius:16px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.07)}
    .benefit strong{display:block;font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;color:var(--gold);margin-bottom:4px}
    .main{padding:42px 36px;display:flex;align-items:center}
    .card{width:100%}
    .title{font-size:.88rem;letter-spacing:.2em;text-transform:uppercase;color:#92a8ce;margin-bottom:10px}
    .big{font-family:'Playfair Display',serif;font-size:2rem;margin:0 0 10px}
    .sub{font-size:.96rem;color:var(--muted);line-height:1.8;margin-bottom:24px}
    label{display:block;font-size:.78rem;letter-spacing:.14em;text-transform:uppercase;color:#9db1d5;font-weight:700;margin-bottom:8px}
    .field{margin-bottom:16px}
    input{width:100%;height:56px;border-radius:16px;border:1px solid rgba(132,160,214,.18);background:rgba(255,255,255,.045);color:var(--text);padding:0 16px;font:inherit;outline:none}
    input:focus{border-color:#4f88ea;box-shadow:0 0 0 2px rgba(79,136,234,.12)}
    button{width:100%;height:56px;border:none;border-radius:16px;background:linear-gradient(135deg,#f9d548,#eecb34);color:#1b2340;font-size:.82rem;font-weight:800;letter-spacing:.18em;text-transform:uppercase;cursor:pointer;box-shadow:0 16px 32px rgba(249,213,72,.22)}
    .hint{margin-top:16px;font-size:.82rem;color:#8ca0c4;line-height:1.7}
    .hint strong{color:#f0f4ff}
    @media (max-width:860px){.shell{grid-template-columns:1fr}.side{padding:30px 24px}.main{padding:28px 24px}.logo{width:132px}h1{font-size:2.15rem}.big{font-size:1.7rem}}
  </style>
</head>
<body>
  <div class="shell">
    <div class="side">
      <img class="logo" src="https://res.cloudinary.com/djicyjlid/image/upload/v1774021620/ChatGPT_Image_Mar_20_2026_09_16_47_PM_byvdhf.png" alt="KRIT">
      <div class="eyebrow">Private KRIT access</div>
      <h1>Enter the KRIT website</h1>
      <div class="copy">This live build is protected behind a login gate. Only approved visitors can open the storefront, product page, account page, and checkout flow.</div>
      <div class="benefits">
        <div class="benefit"><strong>Protected access</strong>Only signed-in visitors can view the site and assets.</div>
        <div class="benefit"><strong>Multi-page storefront</strong>Index, product, account, and checkout are now split into cleaner entry pages.</div>
        <div class="benefit"><strong>Railway ready</strong>This login gate is built for direct deployment on Railway.</div>
      </div>
    </div>
    <div class="main">
      <div class="card">
        <div class="title">Authorized entry</div>
        <div class="big">Sign in to continue</div>
        <div class="sub">Use your KRIT access credentials to open the live website.</div>
        ${errorBlock}
        <form method="post" action="/login">
          <div class="field">
            <label for="username">Username</label>
            <input id="username" name="username" type="text" autocomplete="username" required>
          </div>
          <div class="field">
            <label for="password">Password</label>
            <input id="password" name="password" type="password" autocomplete="current-password" required>
          </div>
          <button type="submit">Open Website</button>
        </form>
        <div class="hint">${hintText}</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  return res.redirect('/');
}

function sendProtectedPage(pageName){
  return function(_req, res){
    res.sendFile(path.join(__dirname, pageName));
  };
}

async function postToErp(endpoint, payload) {
  if (!ERP_BASE_URL || !ERP_WEBHOOK_SECRET) {
    return { ok: false, status: 503, body: { error: 'ERP integration is not configured.' } };
  }

  try {
    const response = await fetch(`${ERP_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': ERP_WEBHOOK_SECRET
      },
      body: JSON.stringify(payload || {})
    });

    const text = await response.text();
    let body = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch (_error) {
      body = { raw: text };
    }

    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    return { ok: false, status: 502, body: { error: error.message || 'ERP request failed.' } };
  }
}

app.get('/', (req, res) => {
  if (req.session && req.session.authenticated) return res.redirect('/index.html');
  res.status(200).send(renderLogin());
});

app.post('/login', (req, res) => {
  if (!ACCESS_CONFIGURED) {
    return res.status(503).send(renderLogin('Access credentials are not configured yet. Please add ADMIN_USERNAME and ADMIN_PASSWORD before logging in.'));
  }
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    req.session.authenticated = true;
    req.session.username = username;
    return res.redirect('/index.html');
  }
  res.status(401).send(renderLogin('Invalid username or password.'));
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('krit.sid');
    res.redirect('/');
  });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', app: 'KRIT Website', protected: true, pages: ['index','product','account','checkout'] });
});

app.post('/api/erp/customer', requireAuth, async (req, res) => {
  const result = await postToErp('/api/webhook/customer', req.body);
  res.status(result.status).json(result.body);
});

app.post('/api/erp/order', requireAuth, async (req, res) => {
  const result = await postToErp('/api/webhook/order', req.body);
  res.status(result.status).json(result.body);
});

app.post('/api/erp/visit', requireAuth, async (req, res) => {
  const result = await postToErp('/api/webhook/visit', req.body);
  res.status(result.status).json(result.body);
});

app.use('/assets', requireAuth, express.static(path.join(__dirname, 'assets')));
app.get('/site', requireAuth, (_req, res) => res.redirect('/index.html'));
app.get('/index.html', requireAuth, sendProtectedPage('index.html'));
app.get('/product.html', requireAuth, sendProtectedPage('product.html'));
app.get('/account.html', requireAuth, sendProtectedPage('account.html'));
app.get('/checkout.html', requireAuth, sendProtectedPage('checkout.html'));
app.get('/KRIT_website_final%20(53).html', requireAuth, (_req, res) => res.redirect('/index.html'));
app.get('/KRIT_website_final (53).html', requireAuth, (_req, res) => res.redirect('/index.html'));

app.listen(PORT, () => {
  console.log(`KRIT Website live on http://localhost:${PORT}`);
});
