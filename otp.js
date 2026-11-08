'use strict';

/*
 * Login OTP through MSG91.
 *
 * Sends the 6-digit code from KRIT's own DLT-registered sender (much faster in
 * India than Firebase's shared route), checks it, then signs the shopper into
 * Firebase with a custom token, so accounts and orders work exactly as before.
 *
 * Switched on only when all three are set in Railway:
 *   MSG91_AUTH_KEY            MSG91 → API → Auth key
 *   MSG91_OTP_TEMPLATE_ID     MSG91 → OTP → template ID (linked to the DLT-approved OTP template)
 *   FIREBASE_SERVICE_ACCOUNT  Firebase → Project settings → Service accounts → Generate new
 *                             private key (paste the whole JSON, or it base64-encoded)
 * Until then the site keeps using Firebase phone sign-in.
 */

const MSG91 = 'https://control.msg91.com/api/v5';
const WINDOW_MS = 10 * 60 * 1000;
const LIMITS = { sendPerPhone: 3, sendPerIp: 10, verifyPerPhone: 6 };

function createOtp({ authKey, templateId, serviceAccount }) {
  let admin = null;
  let adminError = '';
  if (authKey && templateId && serviceAccount) {
    try {
      const raw = serviceAccount.trim().startsWith('{') ? serviceAccount : Buffer.from(serviceAccount, 'base64').toString('utf8');
      admin = require('firebase-admin');
      if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
    } catch (error) {
      adminError = error.message;
      admin = null;
      console.error('MSG91 OTP disabled — Firebase service account could not be loaded:', error.message);
    }
  }
  const enabled = !!(authKey && templateId && admin);

  // Simple in-memory limits so nobody can run up the SMS bill.
  const hits = new Map();
  function tooMany(key, max) {
    const now = Date.now();
    const list = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);
    if (list.length >= max) { hits.set(key, list); return true; }
    list.push(now);
    hits.set(key, list);
    return false;
  }

  function mobileFrom(value) {
    const digits = String(value || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '');
    return /^[6-9]\d{9}$/.test(digits) ? digits : '';
  }

  async function msg91(path, params, method = 'GET') {
    const url = `${MSG91}${path}?${new URLSearchParams(params)}`;
    const res = await fetch(url, { method, headers: { authkey: authKey, accept: 'application/json', 'content-type': 'application/json' } });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && data.type === 'success', data };
  }

  function fail(res, status, code, error) {
    return res.status(status).json({ ok: false, code, error });
  }

  function routes(app, guard) {
    app.get('/api/otp/config', guard, (_req, res) => {
      res.set('Cache-Control', 'no-store');
      res.json({ provider: enabled ? 'msg91' : 'firebase' });
    });

    app.post('/api/otp/send', guard, async (req, res) => {
      if (!enabled) return fail(res, 503, 'auth/operation-not-allowed', 'MSG91 OTP is not set up.');
      const mobile = mobileFrom(req.body && req.body.phone);
      if (!mobile) return fail(res, 400, 'auth/invalid-phone-number', 'Enter a valid 10-digit mobile number.');
      if (tooMany(`p:${mobile}`, LIMITS.sendPerPhone) || tooMany(`ip:${req.ip}`, LIMITS.sendPerIp)) {
        return fail(res, 429, 'auth/too-many-requests', 'Too many codes requested. Please wait a few minutes.');
      }
      try {
        const r = await msg91('/otp', { template_id: templateId, mobile: `91${mobile}`, otp_length: 6, otp_expiry: 10 }, 'POST');
        if (!r.ok) {
          console.warn('MSG91 OTP send failed:', JSON.stringify(r.data));
          return fail(res, 502, 'auth/internal-error', 'Could not send the code.');
        }
        res.json({ ok: true });
      } catch (error) {
        console.warn('MSG91 OTP send error:', error.message);
        fail(res, 502, 'auth/network-request-failed', 'Could not reach the SMS service.');
      }
    });

    app.post('/api/otp/verify', guard, async (req, res) => {
      if (!enabled) return fail(res, 503, 'auth/operation-not-allowed', 'MSG91 OTP is not set up.');
      const mobile = mobileFrom(req.body && req.body.phone);
      const otp = String((req.body && req.body.otp) || '').replace(/\D/g, '');
      if (!mobile || otp.length !== 6) return fail(res, 400, 'auth/invalid-verification-code', 'Enter the 6-digit code.');
      if (tooMany(`v:${mobile}`, LIMITS.verifyPerPhone)) return fail(res, 429, 'auth/too-many-requests', 'Too many tries. Please request a new code in a few minutes.');
      try {
        const r = await msg91('/otp/verify', { otp, mobile: `91${mobile}` });
        if (!r.ok) {
          const msg = String((r.data && r.data.message) || '').toLowerCase();
          const code = msg.includes('expire') ? 'auth/code-expired' : 'auth/invalid-verification-code';
          return fail(res, 400, code, 'That code isn\'t right.');
        }
        // Same Firebase account as before for this number, or a new one.
        const phoneNumber = `+91${mobile}`;
        let user;
        try { user = await admin.auth().getUserByPhoneNumber(phoneNumber); }
        catch (e) {
          if (e.code !== 'auth/user-not-found') throw e;
          user = await admin.auth().createUser({ phoneNumber });
        }
        const token = await admin.auth().createCustomToken(user.uid, { otp: 'msg91' });
        res.json({ ok: true, token });
      } catch (error) {
        console.warn('MSG91 OTP verify error:', error.message);
        fail(res, 502, 'auth/internal-error', 'Could not finish sign-in.');
      }
    });
  }

  return { enabled, routes, status: () => ({ enabled, configured: { authKey: !!authKey, templateId: !!templateId, serviceAccount: !!serviceAccount }, adminError }) };
}

module.exports = { createOtp };
