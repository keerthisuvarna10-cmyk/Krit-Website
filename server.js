// KRIT Website Server — v20260523
const express = require('express');
const session = require('express-session');
const path = require('path');
const crypto = require('crypto');
const { priceOrder } = require('./pricing');
const { verifyFirebaseUser, bearerToken, verifyRazorpayPayment, rateLimiter, escapeHtml } = require('./security');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_ENVIRONMENT;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || (IS_PRODUCTION ? '' : 'Kritniv');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (IS_PRODUCTION ? '' : 'Kritniv');
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const ACCESS_CONFIGURED = Boolean(ADMIN_USERNAME && ADMIN_PASSWORD);
const ACCESS_GATE_ENABLED = String(process.env.ACCESS_GATE_ENABLED || 'false').toLowerCase() === 'true';
const ERP_BASE_URL = String(process.env.ERP_BASE_URL || '').replace(/\/$/, '');
const ERP_WEBHOOK_SECRET = process.env.ERP_WEBHOOK_SECRET || '';
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const ORDER_ALERT_EMAIL = process.env.ORDER_ALERT_EMAIL || 'hello@kritsleep.in';
const ORDER_ALERT_PHONE = normalizeIndianPhone(process.env.ORDER_ALERT_PHONE || '9611211121');
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true';
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || ORDER_ALERT_EMAIL;
const MSG91_AUTH_KEY = process.env.MSG91_AUTH_KEY || '';
const MSG91_FLOW_ID_CUSTOMER_ORDER = process.env.MSG91_FLOW_ID_CUSTOMER_ORDER || '';
const MSG91_FLOW_ID_OWNER_ORDER = process.env.MSG91_FLOW_ID_OWNER_ORDER || '';
const WHATSAPP_CLOUD_ACCESS_TOKEN = process.env.WHATSAPP_CLOUD_ACCESS_TOKEN || '';
const WHATSAPP_CLOUD_PHONE_NUMBER_ID = process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID || '';
const WHATSAPP_CLOUD_TEMPLATE_CUSTOMER_ORDER = process.env.WHATSAPP_CLOUD_TEMPLATE_CUSTOMER_ORDER || '';
const WHATSAPP_CLOUD_TEMPLATE_OWNER_ORDER = process.env.WHATSAPP_CLOUD_TEMPLATE_OWNER_ORDER || '';
const WHATSAPP_CLOUD_TEMPLATE_LANG = process.env.WHATSAPP_CLOUD_TEMPLATE_LANG || 'en';
const WHATSAPP_GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v22.0';
const AISENSY_API_KEY = process.env.AISENSY_API_KEY || '';
const AISENSY_CAMPAIGN_CUSTOMER_ORDER = process.env.AISENSY_CAMPAIGN_CUSTOMER_ORDER || '';
const AISENSY_CAMPAIGN_OWNER_ORDER = process.env.AISENSY_CAMPAIGN_OWNER_ORDER || '';

function normalizeIndianPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  return digits;
}

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
    secure: IS_PRODUCTION,
    maxAge: 1000 * 60 * 60 * 12
  }
}));

/* ── Redirect non-www → www in production ── */
app.use((req, res, next) => {
  if (IS_PRODUCTION) {
    const host = req.headers.host || '';
    if (host && !host.startsWith('www.') && !host.includes('railway.app') && !host.includes('localhost')) {
      return res.redirect(301, `https://www.${host}${req.originalUrl}`);
    }
  }
  next();
});

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

function buildOrderMessageText(order) {
  const customerName = order.customer && order.customer.name ? order.customer.name : 'KRIT Customer';
  const paymentLabel = order.paymentLabel || order.paymentMode || 'Website';
  const total = Number(order.total || 0).toLocaleString('en-IN');
  const firstItem = order.items && order.items[0] ? order.items[0].name : 'KRIT order';
  return {
    customerName,
    paymentLabel,
    total,
    firstItem,
    subject: `KRIT order received: ${order.id}`,
    customerText: [
      `Hi ${customerName},`,
      '',
      `Your KRIT order ${order.id} has been received successfully.`,
      `Item: ${firstItem}`,
      `Payment: ${paymentLabel}`,
      `Total: Rs ${total}`,
      '',
      'You can track your order anytime from your KRIT account.',
      '',
      'Team KRIT'
    ].join('\n'),
    ownerText: [
      'New KRIT order received.',
      '',
      `Order ID: ${order.id}`,
      `Customer: ${customerName}`,
      `Phone: ${(order.customer && order.customer.phone) || ''}`,
      `Email: ${(order.customer && order.customer.email) || ''}`,
      `Payment: ${paymentLabel}`,
      `Total: Rs ${total}`,
      `Item: ${firstItem}`
    ].join('\n')
  };
}

async function sendSmtpOrderEmails(order) {
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return { channel: 'email', ok: false, skipped: true, reason: 'SMTP is not configured.' };
  }
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: { user: SMTP_USER, pass: SMTP_PASS }
  });
  const message = buildOrderMessageText(order);
  const customerEmail = order.customer && order.customer.email ? String(order.customer.email).trim() : '';
  const tasks = [];
  if (customerEmail) {
    tasks.push(transporter.sendMail({
      from: SMTP_FROM,
      to: customerEmail,
      subject: message.subject,
      text: message.customerText,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.7;color:#122033">
        <h2 style="margin:0 0 12px;color:#1e7a46">Your KRIT order has been received</h2>
        <p>Hi ${escapeHtml(message.customerName)},</p>
        <p>Your order <strong>${escapeHtml(order.id)}</strong> has been received successfully.</p>
        <p><strong>Item:</strong> ${escapeHtml(message.firstItem)}<br><strong>Payment:</strong> ${escapeHtml(message.paymentLabel)}<br><strong>Total:</strong> Rs ${escapeHtml(message.total)}</p>
        <p>You can track your order anytime from your KRIT account.</p>
        <p>Team KRIT</p>
      </div>`
    }));
  }
  tasks.push(transporter.sendMail({
    from: SMTP_FROM,
    to: ORDER_ALERT_EMAIL,
    subject: `[Owner] ${message.subject}`,
    text: message.ownerText
  }));
  await Promise.all(tasks);
  return { channel: 'email', ok: true };
}

async function sendMsg91OrderSms(order) {
  if (!MSG91_AUTH_KEY) {
    return { channel: 'sms', ok: false, skipped: true, reason: 'MSG91 is not configured.' };
  }
  const customerMobile = normalizeIndianPhone(order.customer && order.customer.phone);
  const message = buildOrderMessageText(order);
  const tasks = [];
  async function callMsg91(flowId, mobile, extra) {
    if (!flowId || !mobile) return null;
    const response = await fetch('https://control.msg91.com/api/v5/flow/', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        authkey: MSG91_AUTH_KEY
      },
      body: JSON.stringify({
        flow_id: flowId,
        recipients: [{
          mobiles: mobile,
          order_id: order.id,
          customer_name: message.customerName,
          total: message.total,
          payment_mode: message.paymentLabel,
          product_name: message.firstItem,
          ...extra
        }]
      })
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`MSG91 ${response.status}: ${text}`);
    }
    return true;
  }
  if (customerMobile && MSG91_FLOW_ID_CUSTOMER_ORDER) {
    tasks.push(callMsg91(MSG91_FLOW_ID_CUSTOMER_ORDER, customerMobile, { audience: 'customer' }));
  }
  if (ORDER_ALERT_PHONE && MSG91_FLOW_ID_OWNER_ORDER) {
    tasks.push(callMsg91(MSG91_FLOW_ID_OWNER_ORDER, ORDER_ALERT_PHONE, {
      audience: 'owner',
      customer_phone: customerMobile
    }));
  }
  if (!tasks.length) {
    return { channel: 'sms', ok: false, skipped: true, reason: 'MSG91 flow IDs are not configured.' };
  }
  await Promise.all(tasks);
  return { channel: 'sms', ok: true };
}

async function sendMetaWhatsAppOrderMessages(order) {
  if (!WHATSAPP_CLOUD_ACCESS_TOKEN || !WHATSAPP_CLOUD_PHONE_NUMBER_ID) {
    return { channel: 'whatsapp', ok: false, skipped: true, reason: 'WhatsApp Cloud API is not configured.' };
  }
  const customerMobile = normalizeIndianPhone(order.customer && order.customer.phone);
  const message = buildOrderMessageText(order);
  const tasks = [];
  async function callWhatsAppTemplate(destination, templateName, bodyParams) {
    if (!destination || !templateName) return null;
    const response = await fetch(`https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${WHATSAPP_CLOUD_PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${WHATSAPP_CLOUD_ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: destination,
        type: 'template',
        template: {
          name: templateName,
          language: { code: WHATSAPP_CLOUD_TEMPLATE_LANG },
          components: [{
            type: 'body',
            parameters: bodyParams.map((value) => ({
              type: 'text',
              text: String(value || '')
            }))
          }]
        }
      })
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`WhatsApp Cloud API ${response.status}: ${text}`);
    }
    return true;
  }

  if (customerMobile && WHATSAPP_CLOUD_TEMPLATE_CUSTOMER_ORDER) {
    tasks.push(callWhatsAppTemplate(customerMobile, WHATSAPP_CLOUD_TEMPLATE_CUSTOMER_ORDER, [
      order.id,
      message.firstItem,
      `Rs ${message.total}`,
      message.paymentLabel
    ]));
  }
  if (ORDER_ALERT_PHONE && WHATSAPP_CLOUD_TEMPLATE_OWNER_ORDER) {
    tasks.push(callWhatsAppTemplate(ORDER_ALERT_PHONE, WHATSAPP_CLOUD_TEMPLATE_OWNER_ORDER, [
      order.id,
      message.customerName,
      (order.customer && order.customer.phone) || '',
      `Rs ${message.total}`
    ]));
  }
  if (!tasks.length) {
    return { channel: 'whatsapp', ok: false, skipped: true, reason: 'WhatsApp template names are not configured.' };
  }
  await Promise.all(tasks);
  return { channel: 'whatsapp', ok: true, provider: 'meta-cloud-api' };
}

async function sendAiSensyOrderWhatsapp(order) {
  if (!AISENSY_API_KEY) {
    return { channel: 'whatsapp', ok: false, skipped: true, reason: 'AiSensy is not configured.' };
  }
  const customerMobile = normalizeIndianPhone(order.customer && order.customer.phone);
  const message = buildOrderMessageText(order);
  const tasks = [];
  async function callAiSensy(campaignName, destination, templateParams) {
    if (!campaignName || !destination) return null;
    const response = await fetch('https://backend.aisensy.com/campaign/t1/api/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        apiKey: AISENSY_API_KEY,
        campaignName: campaignName,
        destination: destination,
        userName: message.customerName,
        templateParams: templateParams,
        source: 'krit-website'
      })
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`AiSensy ${response.status}: ${text}`);
    }
    return true;
  }
  if (customerMobile && AISENSY_CAMPAIGN_CUSTOMER_ORDER) {
    tasks.push(callAiSensy(AISENSY_CAMPAIGN_CUSTOMER_ORDER, customerMobile, [
      order.id,
      message.firstItem,
      `Rs ${message.total}`,
      message.paymentLabel
    ]));
  }
  if (ORDER_ALERT_PHONE && AISENSY_CAMPAIGN_OWNER_ORDER) {
    tasks.push(callAiSensy(AISENSY_CAMPAIGN_OWNER_ORDER, ORDER_ALERT_PHONE, [
      order.id,
      message.customerName,
      (order.customer && order.customer.phone) || '',
      `Rs ${message.total}`
    ]));
  }
  if (!tasks.length) {
    return { channel: 'whatsapp', ok: false, skipped: true, reason: 'AiSensy campaign names are not configured.' };
  }
  await Promise.all(tasks);
  return { channel: 'whatsapp', ok: true };
}

async function notifyOrderStakeholders(order) {
  const results = [];
  for (const sender of [sendSmtpOrderEmails, sendMsg91OrderSms, sendMetaWhatsAppOrderMessages, sendAiSensyOrderWhatsapp]) {
    try {
      results.push(await sender(order));
    } catch (error) {
      results.push({
        channel: sender.name,
        ok: false,
        skipped: false,
        reason: error.message || 'Notification failed.'
      });
    }
  }
  return results;
}

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
    body{display:flex;align-items:center;justify-content:center;padding:14px}
    .shell{width:min(720px,100%);display:grid;grid-template-columns:minmax(240px,.9fr) minmax(300px,1.1fr);background:linear-gradient(180deg,var(--panel) 0%, #08111f 100%);border:1px solid var(--line);border-radius:20px;overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,.4)}
    .side{padding:22px 22px;background:radial-gradient(circle at top left, rgba(249,213,72,.14), transparent 38%),radial-gradient(circle at bottom right, rgba(43,125,233,.14), transparent 38%),linear-gradient(180deg,var(--panel2),#08111f)}
    .logo{width:78px;display:block;margin-bottom:10px}
    .eyebrow{font-size:.6rem;letter-spacing:.22em;text-transform:uppercase;color:#9fc0ff;margin-bottom:8px}
    h1{font-family:'Playfair Display',serif;font-size:1.35rem;line-height:1.18;margin:0 0 8px}
    .copy{font-size:.78rem;line-height:1.5;color:#bfd0eb;max-width:34ch}
    .main{padding:22px 22px;display:flex;align-items:center}
    .card{width:100%}
    .title{font-size:.66rem;letter-spacing:.2em;text-transform:uppercase;color:#92a8ce;margin-bottom:4px}
    .big{font-family:'Playfair Display',serif;font-size:1.1rem;margin:0 0 4px}
    .sub{font-size:.76rem;color:var(--muted);line-height:1.45;margin-bottom:12px}
    label{display:block;font-size:.6rem;letter-spacing:.14em;text-transform:uppercase;color:#9db1d5;font-weight:700;margin-bottom:4px}
    .field{margin-bottom:8px}
    input{width:100%;height:40px;border-radius:9px;border:1px solid rgba(132,160,214,.18);background:rgba(255,255,255,.045);color:var(--text);padding:0 12px;font:inherit;outline:none;font-size:.9rem}
    input:focus{border-color:#4f88ea;box-shadow:0 0 0 2px rgba(79,136,234,.12)}
    button{width:100%;height:40px;border:none;border-radius:9px;background:linear-gradient(135deg,#f9d548,#eecb34);color:#1b2340;font-size:.72rem;font-weight:800;letter-spacing:.16em;text-transform:uppercase;cursor:pointer;box-shadow:0 8px 16px rgba(249,213,72,.16);margin-top:4px}
    .hint{margin-top:10px;font-size:.66rem;color:#8ca0c4;line-height:1.5}
    .hint strong{color:#f0f4ff}
    @media (max-width:780px){.shell{grid-template-columns:1fr;max-width:400px}.side{padding:18px 20px 10px;text-align:center}.logo{margin:0 auto 8px}.copy{max-width:none;margin:0 auto}.main{padding:16px 20px 20px}h1{font-size:1.2rem}.big{font-size:1rem}}
  </style>
</head>
<body>
  <div class="shell">
    <div class="side">
      <img class="logo" src="https://res.cloudinary.com/djicyjlid/image/upload/v1774021620/ChatGPT_Image_Mar_20_2026_09_16_47_PM_byvdhf.png" alt="KRIT">
      <div class="eyebrow">Private KRIT access</div>
      <h1>Enter the KRIT website</h1>
      <div class="copy">This live build is protected behind a login gate. Only approved visitors can open the storefront.</div>
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
  if (!ACCESS_GATE_ENABLED) return next();
  if (req.session && req.session.authenticated) return next();
  return res.redirect('/');
}

function isPublicPath(req) {
  return (
    req.path === '/' ||
    req.path === '/login' ||
    req.path === '/logout' ||
    req.path === '/health'
  );
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
  if (!ACCESS_GATE_ENABLED) {
    return res.sendFile(path.join(__dirname, 'index.html'));
  }
  if (req.session && req.session.authenticated) {
    return res.sendFile(path.join(__dirname, 'index.html'));
  }
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
    return res.redirect('/');
  }
  res.status(401).send(renderLogin('Invalid username or password.'));
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('krit.sid');
    res.redirect('/');
  });
});

// GET variant so admins can log out by simply navigating to /logout
app.get('/logout', (req, res) => {
  if (req.session) {
    req.session.destroy(() => {
      res.clearCookie('krit.sid');
      res.redirect('/');
    });
  } else {
    res.clearCookie('krit.sid');
    res.redirect('/');
  }
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', app: 'KRIT Website', protected: ACCESS_GATE_ENABLED, pages: ['index','product','account','checkout'] });
});

app.use((req, res, next) => {
  if (isPublicPath(req)) return next();
  return requireAuth(req, res, next);
});

/* ── Customer accounts ──
   Both calls need a real Firebase login. The phone number / email used to
   find the customer come from that login (checked with Google), never from
   what the browser sends, so nobody can read or overwrite someone else's
   details by typing in their number. */
app.post('/api/erp/customer', requireAuth, async (req, res) => {
  const user = await verifyFirebaseUser(bearerToken(req));
  if (!user) return res.status(401).json({ error: 'Please log in again.' });
  const body = req.body || {};
  const result = await postToErp('/api/webhook/customer', {
    ...body,
    phone: user.phone,
    email: user.email || (user.phone ? '' : body.email || '')
  });
  res.status(result.status).json(result.body);
});

app.post('/api/erp/customer-orders', requireAuth, async (req, res) => {
  const user = await verifyFirebaseUser(bearerToken(req));
  if (!user) return res.status(401).json({ error: 'Please log in again to see your orders.' });
  const result = await postToErp('/api/webhook/customer-orders', { phone: user.phone, email: user.email });
  res.status(result.status).json(result.body);
});

/* ── Orders ──
   The server rebuilds every order from product ids + quantities using the
   price list in pricing.js, checks the customer details, and for online
   orders confirms with Razorpay that the exact amount was paid. Only then is
   the order sent to the ERP and the order alerts sent. */
const ORDER_ID_PATTERN = /^[A-Za-z0-9_-]{4,40}$/;
const tooManyOrders = rateLimiter(15, 60 * 60 * 1000); // 15 per visitor per hour

function cleanText(value, max) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
}

/* Older pages sent { customer_name, items:[{ product_id, description, rate }] };
   checkout.html sends { customer:{...}, items:[{ id, name, price }] }. */
function toCheckoutShape(body) {
  if (body.customer || !body.customer_name) return body;
  const mode = String(body.payment_mode || '').toLowerCase();
  return {
    ...body,
    paymentMode: mode.includes('cod') || mode.includes('cash') ? 'cod' : 'online',
    items: (body.items || []).map((i) => ({ id: i.product_id || i.sku, name: i.description, qty: i.qty })),
    customer: {
      name: body.customer_name, phone: body.customer_phone, email: body.customer_email,
      address: body.customer_address, city: body.customer_city, state: body.customer_state,
      pincode: body.customer_pincode
    }
  };
}

function buildServerOrder(rawBody) {
  const body = toCheckoutShape(rawBody || {});
  const id = String(body.id || '');
  if (!ORDER_ID_PATTERN.test(id)) return { ok: false, error: 'Invalid order id.' };

  const isCod = String(body.paymentMode || '').toLowerCase() === 'cod';
  const priced = priceOrder({ items: body.items, couponCode: body.couponCode, paymentMode: isCod ? 'cod' : 'online' });
  if (!priced.ok) return { ok: false, error: priced.error };

  const c = body.customer || {};
  const customer = {
    name: cleanText(c.name, 100),
    email: cleanText(c.email, 160),
    phone: String(c.phone || '').replace(/\D/g, '').slice(-10),
    address: cleanText(c.address, 400),
    landmark: cleanText(c.landmark, 150),
    city: cleanText(c.city, 80),
    state: cleanText(c.state, 80),
    pincode: String(c.pincode || '').replace(/\D/g, '').slice(0, 6),
    notes: cleanText(c.notes, 300)
  };
  if (!customer.name) return { ok: false, error: 'Please enter your name.' };
  if (!/^[6-9]\d{9}$/.test(customer.phone)) return { ok: false, error: 'Please enter a valid 10-digit mobile number.' };
  if (!customer.address) return { ok: false, error: 'Please enter your delivery address.' };
  if (!/^\d{6}$/.test(customer.pincode)) return { ok: false, error: 'Please enter a valid 6-digit PIN code.' };
  if (customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) customer.email = '';

  const items = priced.lines.map((line, i) => ({
    id: line.id,
    name: cleanText((body.items[i] && body.items[i].name) || line.id, 120),
    qty: line.qty,
    price: line.price
  }));

  return {
    ok: true,
    isCod,
    order: {
      id,
      createdAt: new Date().toISOString(),
      channel: 'website',
      items,
      subtotal: priced.subtotal,
      discount: priced.discount,
      couponCode: priced.couponCode,
      paymentMode: isCod ? 'cod' : 'online',
      paymentLabel: isCod ? 'Cash on Delivery' : 'Online Payment',
      paymentAdjust: priced.paymentAdjust,
      shipping: priced.shipping,
      total: priced.total,
      status: isCod ? 'confirmed' : 'payment_pending',
      paymentVerified: false,
      razorpayOrderId: cleanText(body.razorpayOrderId, 60),
      razorpayPaymentId: cleanText(body.razorpayPaymentId, 60),
      customer
    },
    signature: String(body.razorpaySignature || '')
  };
}

app.post('/api/erp/order', requireAuth, async (req, res) => {
  if (tooManyOrders(req)) {
    return res.status(429).json({ error: 'Too many orders from this device. Please try again later or contact us on WhatsApp.' });
  }
  const built = buildServerOrder(req.body);
  if (!built.ok) return res.status(400).json({ error: built.error });
  const order = built.order;

  if (!built.isCod) {
    const payment = await verifyRazorpayPayment({
      keyId: RAZORPAY_KEY_ID,
      keySecret: RAZORPAY_KEY_SECRET,
      razorpayOrderId: order.razorpayOrderId,
      razorpayPaymentId: order.razorpayPaymentId,
      signature: built.signature,
      expectedAmount: order.total,
      receipt: order.id
    });
    if (!payment.ok) {
      console.warn('Order rejected, payment not confirmed:', order.id, payment.error);
      return res.status(402).json({ error: payment.error });
    }
    order.paymentVerified = true;
    order.status = 'paid';
  }

  const result = await postToErp('/api/webhook/order', order);
  if (!result.ok) {
    console.error('ERP did not save order', order.id, result.status, JSON.stringify(result.body).slice(0, 200));
    if (order.paymentVerified) {
      // The customer has paid. Keep the full order in the Railway logs so it
      // can be re-entered by hand, and still alert the owner.
      console.error('PAID ORDER NOT IN ERP — full details:', JSON.stringify(order));
      notifyOrderStakeholders(order).catch(() => {});
    }
    return res.status(502).json({ error: 'We could not save your order. Please try again.', paid: order.paymentVerified });
  }

  // Order alerts go out from here, only for orders that were really placed.
  // A retry of the same order (duplicate) does not send them again.
  if (!(result.body && result.body.duplicate)) {
    notifyOrderStakeholders(order)
      .then((channels) => {
        const failed = channels.filter((ch) => ch && !ch.ok && !ch.skipped);
        if (failed.length) console.warn('Order alert failures for', order.id, JSON.stringify(failed).slice(0, 300));
      })
      .catch((error) => console.warn('Order alerts failed for', order.id, error.message));
  }

  res.json({ ok: true, id: order.id, total: order.total, paymentVerified: order.paymentVerified });
});

app.post('/api/erp/visit', requireAuth, async (req, res) => {
  const result = await postToErp('/api/webhook/visit', req.body);
  res.status(result.status).json(result.body);
});

// ──────────────── Razorpay ────────────────
// Creates a Razorpay Order (server-side, using the secret key). Client
// then opens Razorpay Checkout with the returned order_id. After payment
// the client POSTs back to /api/razorpay/verify where we HMAC-verify the
// signature before marking the order paid.
app.post('/api/razorpay/order', requireAuth, async (req, res) => {
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    return res.status(503).json({ error: 'Payment gateway is not configured. Please try again shortly.' });
  }
  const receipt = String(req.body && req.body.receipt || '').slice(0, 40);
  if (!receipt) {
    return res.status(400).json({ error: 'Invalid receipt.' });
  }
  // The amount is calculated here from product ids + quantities. Any amount
  // the browser sends is ignored, so it can't be edited to pay less.
  const priced = priceOrder({
    items: req.body && req.body.items,
    couponCode: req.body && req.body.couponCode,
    paymentMode: 'online'
  });
  if (!priced.ok) {
    return res.status(400).json({ error: priced.error });
  }
  const amount = priced.total;
  if (amount <= 0) {
    return res.status(400).json({ error: 'Invalid order amount.' });
  }
  try {
    const auth = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${auth}`
      },
      body: JSON.stringify({
        amount: Math.round(amount * 100), // paise
        currency: 'INR',
        receipt: receipt,
        payment_capture: 1,
        notes: { source: 'kritsleep.in', receipt: receipt }
      })
    });
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch (_e) { body = { raw: text }; }
    if (!response.ok) {
      const message = (body && body.error && body.error.description) || 'Could not start payment. Please try again.';
      return res.status(response.status).json({ error: message });
    }
    return res.json({
      id: body.id,
      amount: body.amount,
      currency: body.currency,
      receipt: body.receipt,
      key_id: RAZORPAY_KEY_ID,
      pricing: priced
    });
  } catch (error) {
    return res.status(502).json({ error: error.message || 'Payment gateway request failed.' });
  }
});

app.post('/api/razorpay/verify', requireAuth, (req, res) => {
  if (!RAZORPAY_KEY_SECRET) {
    return res.status(503).json({ ok: false, error: 'Payment gateway is not configured.' });
  }
  const orderId = String(req.body && req.body.razorpay_order_id || '');
  const paymentId = String(req.body && req.body.razorpay_payment_id || '');
  const signature = String(req.body && req.body.razorpay_signature || '');
  if (!orderId || !paymentId || !signature) {
    return res.status(400).json({ ok: false, error: 'Missing payment parameters.' });
  }
  const expected = crypto
    .createHmac('sha256', RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  const verified = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!verified) {
    return res.status(400).json({ ok: false, error: 'Payment signature mismatch.' });
  }
  return res.json({ ok: true, razorpay_order_id: orderId, razorpay_payment_id: paymentId });
});

/* ── Track Order ──
   Anyone with the order ID AND the mobile number on the order can see its
   status (no login needed, so COD/guest customers can track too). Limited
   per visitor so IDs can't be guessed by trying many. */
const tooManyTrackLookups = rateLimiter(30, 60 * 60 * 1000);
app.post('/api/track-order', requireAuth, async (req, res) => {
  if (tooManyTrackLookups(req)) {
    return res.status(429).json({ error: 'Too many tries. Please wait a while, or message us on WhatsApp for help.' });
  }
  const id = String((req.body && req.body.orderId) || '').trim().replace(/^#/, '').toUpperCase();
  const phone = String((req.body && req.body.phone) || '').replace(/\D/g, '').slice(-10);
  if (!ORDER_ID_PATTERN.test(id)) return res.status(400).json({ error: 'Please enter your order ID (it starts with KRIT).' });
  if (phone.length !== 10) return res.status(400).json({ error: 'Please enter the 10-digit mobile number used for the order.' });
  const result = await postToErp('/api/webhook/track-order', { id, phone });
  if (result.status === 404) return res.status(404).json({ error: 'We could not find an order with that ID and mobile number. Please check both.' });
  if (!result.ok) return res.status(502).json({ error: 'Tracking is unavailable right now. Please try again in a few minutes.' });
  res.json(result.body);
});

// Order alerts are now sent by /api/erp/order once an order is saved, so this
// can no longer be used to send messages to arbitrary numbers or emails.
// Kept so older pages that still call it don't show an error.
app.post('/api/notify/order', requireAuth, (_req, res) => {
  res.json({ ok: true, skipped: true, reason: 'Order alerts are sent automatically when the order is saved.' });
});

app.use('/assets', requireAuth, express.static(path.join(__dirname, 'assets')));
app.get('/site', requireAuth, (_req, res) => res.redirect('/'));
app.get('/index.html', requireAuth, sendProtectedPage('index.html'));
app.get('/product.html', requireAuth, sendProtectedPage('product.html'));
app.get('/account.html', requireAuth, sendProtectedPage('account.html'));
app.get('/checkout.html', requireAuth, sendProtectedPage('checkout.html'));
app.get('/track.html', requireAuth, sendProtectedPage('track.html'));
app.get('/track', (_req, res) => res.redirect(301, '/track.html'));
app.get('/KRIT_website_final%20(53).html', requireAuth, (_req, res) => res.redirect('/index.html'));
app.get('/KRIT_website_final (53).html', requireAuth, (_req, res) => res.redirect('/index.html'));

// ── Clean URLs ──
app.get('/home', (_req, res) => res.redirect(301, '/'));
// Product links serve the homepage, which opens that product. Each gets its
// own canonical URL so Google treats them as separate product pages.
const PRODUCT_IDS = new Set(require('./pricing').PRODUCTS.map((p) => p.id));
app.get('/product/:id', requireAuth, (req, res) => {
  if (!PRODUCT_IDS.has(req.params.id)) return res.redirect(302, '/#buy');
  const fs = require('fs');
  const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8').replace(
    '<link rel="canonical" href="https://www.kritsleep.in/">',
    `<link rel="canonical" href="https://www.kritsleep.in/product/${req.params.id}">`
  );
  res.type('html').send(html);
});


// ── SEO: robots.txt ──
app.get('/robots.txt', (_req, res) => {
  res.type('text/plain');
  res.send([
    'User-agent: *',
    'Allow: /',
    'Disallow: /login',
    'Disallow: /logout',
    'Disallow: /api/',
    '',
    'Sitemap: https://www.kritsleep.in/sitemap.xml'
  ].join('\n'));
});

// ── SEO: sitemap.xml ──
app.get('/sitemap.xml', (_req, res) => {
  const base = 'https://www.kritsleep.in';
  const now = new Date().toISOString().split('T')[0];
  const urls = [
    { loc: base + '/',                    priority: '1.0', freq: 'weekly'  },
    { loc: base + '/product/contour-3',   priority: '0.9', freq: 'weekly'  },
    { loc: base + '/product/half-3',      priority: '0.9', freq: 'weekly'  },
    { loc: base + '/product/half-2',      priority: '0.8', freq: 'weekly'  },
    { loc: base + '/product/soap-2',      priority: '0.8', freq: 'weekly'  },
    { loc: base + '/account.html',        priority: '0.5', freq: 'monthly' },
  ];
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(u =>
      '  <url>\n' +
      `    <loc>${u.loc}</loc>\n` +
      `    <lastmod>${now}</lastmod>\n` +
      `    <changefreq>${u.freq}</changefreq>\n` +
      `    <priority>${u.priority}</priority>\n` +
      '  </url>'
    ),
    '</urlset>'
  ].join('\n');
  res.type('application/xml');
  res.send(xml);
});

app.listen(PORT, () => {
  console.log(`KRIT Website live on http://localhost:${PORT}`);
});
