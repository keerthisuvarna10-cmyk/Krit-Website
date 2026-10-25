'use strict';

/*
 * Checks the server does before trusting anything the browser says:
 *   - who is logged in (Firebase login, checked with Google, not the browser)
 *   - whether an online order was really paid (asked from Razorpay directly)
 *   - a simple per-visitor limit on how often orders can be placed
 */

const crypto = require('crypto');

// Public Firebase web key for project krit-7fa79 (the same one the pages
// use). It only lets us ask Google "is this login token real?".
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyDHDCv4zEmSAiO6vr8pz733aON7cTeYg8I';

const tokenCache = new Map(); // token -> { user, expires }

/*
 * Returns { uid, phone, email } for a real, current Firebase login, or null.
 * phone is the last 10 digits; email is only given when Google/Firebase has
 * verified it, so nobody can claim someone else's email address.
 */
async function verifyFirebaseUser(idToken) {
  const token = String(idToken || '');
  if (!token || token.length > 4096) return null;

  const cached = tokenCache.get(token);
  if (cached && cached.expires > Date.now()) return cached.user;

  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(FIREBASE_API_KEY)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: token })
      }
    );
    if (!response.ok) return null;
    const body = await response.json();
    const account = body && Array.isArray(body.users) ? body.users[0] : null;
    if (!account || account.disabled) return null;

    const phoneDigits = String(account.phoneNumber || '').replace(/\D/g, '');
    const user = {
      uid: account.localId,
      phone: phoneDigits.length >= 10 ? phoneDigits.slice(-10) : '',
      email: account.email && account.emailVerified ? String(account.email).toLowerCase() : ''
    };
    if (!user.phone && !user.email) return null;

    // Firebase login tokens last an hour; remember the answer for 5 minutes.
    tokenCache.set(token, { user, expires: Date.now() + 5 * 60 * 1000 });
    if (tokenCache.size > 2000) tokenCache.delete(tokenCache.keys().next().value);
    return user;
  } catch (_error) {
    return null;
  }
}

function bearerToken(req) {
  const header = String(req.headers.authorization || '');
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

/*
 * Confirms with Razorpay that `razorpayOrderId` was paid in full for
 * `expectedAmount` rupees and belongs to our order `receipt`, and that the
 * payment signature the browser passed on really came from Razorpay.
 */
async function verifyRazorpayPayment({ keyId, keySecret, razorpayOrderId, razorpayPaymentId, signature, expectedAmount, receipt }) {
  if (!keyId || !keySecret) return { ok: false, error: 'Payment gateway is not configured.' };
  if (!razorpayOrderId || !razorpayPaymentId || !signature) return { ok: false, error: 'Missing payment details.' };

  const expected = crypto.createHmac('sha256', keySecret).update(`${razorpayOrderId}|${razorpayPaymentId}`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(signature));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, error: 'Payment signature mismatch.' };
  }

  try {
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    const response = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(razorpayOrderId)}`, {
      headers: { Authorization: `Basic ${auth}` }
    });
    if (!response.ok) return { ok: false, error: 'Could not confirm payment with Razorpay.' };
    const rzpOrder = await response.json();
    if (rzpOrder.status !== 'paid') return { ok: false, error: 'Payment has not completed.' };
    if (Number(rzpOrder.amount_paid) !== Math.round(expectedAmount * 100)) {
      return { ok: false, error: 'Paid amount does not match the order total.' };
    }
    if (receipt && rzpOrder.receipt && rzpOrder.receipt !== receipt) {
      return { ok: false, error: 'Payment belongs to a different order.' };
    }
    return { ok: true };
  } catch (_error) {
    return { ok: false, error: 'Could not confirm payment with Razorpay.' };
  }
}

/* Allows `max` actions per visitor (by IP) per `windowMs`. */
function rateLimiter(max, windowMs) {
  const hits = new Map();
  return function limited(req) {
    const now = Date.now();
    const key = req.ip || 'unknown';
    const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) hits.delete(hits.keys().next().value);
    return recent.length > max;
  };
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = { verifyFirebaseUser, bearerToken, verifyRazorpayPayment, rateLimiter, escapeHtml };
