'use strict';

/*
 * Delivery date for a PIN code, for the product panel, checkout and the
 * order-confirmed page. Asks the ERP (which uses Shiprocket from the Kudlu
 * warehouse); if the ERP can't be reached, works out a regional estimate here
 * with the same rules, so shoppers always see a date.
 */

const { createDelivery } = require('./delivery-core');
const CACHE_MS = 30 * 60 * 1000;

function createDeliveryEstimates({ baseUrl }) {
  const local = createDelivery({ shiprocket: null, setting: (_k, f) => f });
  const cache = new Map();

  async function fromErp(pincode, cod) {
    if (!baseUrl) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const q = new URLSearchParams({ pincode, cod: cod ? '1' : '0' });
      const res = await fetch(`${baseUrl}/api/public/delivery-estimate?${q}`, { signal: controller.signal });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body || (body.ok !== true && !body.error)) throw new Error(`ERP answered ${res.status}`);
      return body;
    } catch (e) {
      console.warn('Delivery estimate from ERP failed:', e.message);
      return null;
    } finally { clearTimeout(timer); }
  }

  async function estimate(pincode, cod) {
    const pin = String(pincode || '').trim();
    if (!/^[1-9]\d{5}$/.test(pin)) return { ok: false, error: 'Enter a valid 6-digit PIN code.' };
    const key = `${pin}|${cod ? 1 : 0}`;
    const hit = cache.get(key);
    // Dates move with the clock (2 PM cut-off), so only reuse within the same hour.
    if (hit && Date.now() - hit.at < CACHE_MS && new Date(hit.at).getUTCHours() === new Date().getUTCHours()) return hit.body;
    const body = (await fromErp(pin, cod)) || (await local.estimate({ pincode: pin, cod }));
    if (body && body.ok) cache.set(key, { at: Date.now(), body });
    if (cache.size > 3000) cache.clear();
    return body;
  }

  return { estimate };
}

module.exports = { createDeliveryEstimates };
