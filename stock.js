'use strict';

/*
 * Live stock for kritsleep.in.
 *
 * The ERP is the only place stock is kept. This file asks the ERP what each
 * pillow has available (On hand − Reserved for unshipped orders) and:
 *   - serves it to the pages (cached for a few seconds), so they can show
 *     "Only 3 left" / "Out of stock" and stop Add to Cart, and
 *   - checks the cart right before the customer pays, so nothing oversells.
 *
 * If the ERP can't be reached, the site keeps selling (an ERP outage should
 * not stop orders) and logs a warning. A product the ERP hasn't linked to the
 * website yet is treated the same way: sold without a limit.
 */

const CACHE_MS = 15 * 1000;

function createStock({ baseUrl, webhookSecret }) {
  let cache = null;
  let cachedAt = 0;
  let pending = null;

  async function fetchFromErp() {
    if (!baseUrl) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(`${baseUrl}/api/public/stock`, { signal: controller.signal });
      if (!res.ok) throw new Error(`ERP answered ${res.status}`);
      const list = await res.json();
      const byId = {};
      (Array.isArray(list) ? list : []).forEach((p) => {
        if (!p || !p.web_id) return;
        byId[p.web_id] = {
          available: Math.max(0, Math.floor(Number(p.available) || 0)),
          status: p.status || 'in',
          lowBadge: Number(p.low_badge) || 5
        };
      });
      return byId;
    } finally {
      clearTimeout(timer);
    }
  }

  // Map of website product id -> { available, status }, or null when unknown.
  async function getAll({ fresh = false } = {}) {
    if (!fresh && cache && Date.now() - cachedAt < CACHE_MS) return cache;
    if (pending) return pending;
    pending = fetchFromErp()
      .then((data) => { if (data) { cache = data; cachedAt = Date.now(); } return data || cache; })
      .catch((error) => { console.warn('Stock: could not reach ERP —', error.message); return cache; })
      .finally(() => { pending = null; });
    return pending;
  }

  // Before payment: are the cart lines ([{ id, qty }]) available right now?
  async function checkLines(lines) {
    let result = null;
    if (baseUrl && webhookSecret) {
      try {
        const res = await fetch(`${baseUrl}/api/webhook/stock-check`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-webhook-secret': webhookSecret },
          body: JSON.stringify({ items: lines.map((l) => ({ id: l.id, qty: l.qty })) })
        });
        if (res.ok) result = await res.json();
      } catch (error) {
        console.warn('Stock check: could not reach ERP —', error.message);
      }
    }
    if (!result) {
      // Fall back to the last numbers we have.
      const all = (await getAll({ fresh: true })) || {};
      const problems = [];
      lines.forEach((l) => {
        const s = all[l.id];
        if (s && l.qty > s.available) problems.push({ id: l.id, requested: l.qty, available: s.available });
      });
      result = { ok: !problems.length, problems };
    }
    cachedAt = 0; // the next page load gets fresh numbers
    if (result.ok) return { ok: true };
    const first = result.problems[0];
    const name = first.name || 'One of the items';
    const error = first.available > 0
      ? `Only ${first.available} ${name} left in stock. Please reduce the quantity to continue.`
      : `Sorry, ${name} just went out of stock. Please remove it from your cart to continue.`;
    return { ok: false, error, problems: result.problems };
  }

  return { getAll, checkLines };
}

module.exports = { createStock };
