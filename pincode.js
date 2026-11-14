'use strict';

/*
 * City and state for an Indian PIN code, for the checkout address form.
 *
 * Asks India Post's public PIN directory (api.postalpincode.in). If that
 * doesn't answer in time, the state is worked out from the first digits of
 * the PIN (city is then left for the shopper to type). Shoppers can always
 * change what was filled in.
 */

const CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const cache = new Map();

// First three digits → state, for ranges that differ from their two-digit block.
const STATE_BY_3 = {
  160: 'Chandigarh', 403: 'Goa', 194: 'Ladakh', 737: 'Sikkim', 744: 'Andaman and Nicobar Islands',
  605: 'Puducherry', 682: 'Kerala', 396: 'Gujarat',
  790: 'Arunachal Pradesh', 791: 'Arunachal Pradesh', 792: 'Arunachal Pradesh',
  793: 'Meghalaya', 794: 'Meghalaya', 795: 'Manipur', 796: 'Mizoram',
  797: 'Nagaland', 798: 'Nagaland', 799: 'Tripura',
  246: 'Uttarakhand', 247: 'Uttarakhand', 248: 'Uttarakhand', 249: 'Uttarakhand', 262: 'Uttarakhand', 263: 'Uttarakhand',
  490: 'Chhattisgarh', 491: 'Chhattisgarh', 492: 'Chhattisgarh', 493: 'Chhattisgarh', 494: 'Chhattisgarh', 495: 'Chhattisgarh', 496: 'Chhattisgarh', 497: 'Chhattisgarh',
  500: 'Telangana', 501: 'Telangana', 502: 'Telangana', 503: 'Telangana', 504: 'Telangana', 505: 'Telangana', 506: 'Telangana', 507: 'Telangana', 508: 'Telangana', 509: 'Telangana',
  814: 'Jharkhand', 815: 'Jharkhand', 816: 'Jharkhand', 822: 'Jharkhand', 825: 'Jharkhand', 826: 'Jharkhand', 827: 'Jharkhand', 828: 'Jharkhand', 829: 'Jharkhand', 831: 'Jharkhand', 832: 'Jharkhand', 833: 'Jharkhand', 834: 'Jharkhand', 835: 'Jharkhand'
};
function stateFromPin(pin) {
  const p3 = +pin.slice(0, 3), p2 = +pin.slice(0, 2);
  if (STATE_BY_3[p3]) return STATE_BY_3[p3];
  if (p2 === 11) return 'Delhi';
  if (p2 >= 12 && p2 <= 13) return 'Haryana';
  if (p2 >= 14 && p2 <= 16) return 'Punjab';
  if (p2 === 17) return 'Himachal Pradesh';
  if (p2 >= 18 && p2 <= 19) return 'Jammu and Kashmir';
  if (p2 >= 20 && p2 <= 28) return 'Uttar Pradesh';
  if (p2 >= 30 && p2 <= 34) return 'Rajasthan';
  if (p2 >= 36 && p2 <= 39) return 'Gujarat';
  if (p2 >= 40 && p2 <= 44) return 'Maharashtra';
  if (p2 >= 45 && p2 <= 49) return 'Madhya Pradesh';
  if (p2 >= 50 && p2 <= 53) return 'Andhra Pradesh';
  if (p2 >= 56 && p2 <= 59) return 'Karnataka';
  if (p2 >= 60 && p2 <= 66) return 'Tamil Nadu';
  if (p2 >= 67 && p2 <= 69) return 'Kerala';
  if (p2 >= 70 && p2 <= 74) return 'West Bengal';
  if (p2 >= 75 && p2 <= 77) return 'Odisha';
  if (p2 === 78) return 'Assam';
  if (p2 >= 80 && p2 <= 85) return 'Bihar';
  return '';
}

// India Post spells some names in old forms; show the ones shoppers use.
const CITY_NAMES = { bangalore: 'Bengaluru', 'bangalore urban': 'Bengaluru', 'bangalore rural': 'Bengaluru Rural', mysore: 'Mysuru', mangalore: 'Mangaluru', 'dakshina kannada': 'Mangaluru', gurgaon: 'Gurugram', bombay: 'Mumbai', calcutta: 'Kolkata', madras: 'Chennai' };
function tidyCity(s) {
  const t = String(s || '').trim();
  return CITY_NAMES[t.toLowerCase()] || t;
}

async function fromIndiaPost(pin) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch('https://api.postalpincode.in/pincode/' + pin, { signal: controller.signal });
    const data = await res.json();
    const d = Array.isArray(data) ? data[0] : null;
    if (!d) return null;
    if (d.Status !== 'Success' || !Array.isArray(d.PostOffice) || !d.PostOffice.length) return { found: false };
    const po = d.PostOffice;
    return {
      found: true,
      city: tidyCity(po[0].District || po[0].Block || po[0].Name),
      state: String(po[0].State || '').trim(),
      areas: [...new Set(po.map((x) => x.Name).filter(Boolean))].slice(0, 12)
    };
  } catch (e) {
    return null;
  } finally { clearTimeout(timer); }
}

async function lookupPincode(pincode) {
  const pin = String(pincode || '').trim();
  if (!/^[1-9]\d{5}$/.test(pin)) return { ok: false, error: 'Enter a valid 6-digit PIN code.' };
  const hit = cache.get(pin);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.body;

  const post = await fromIndiaPost(pin);
  let body;
  if (post && post.found) body = { ok: true, pincode: pin, city: post.city, state: post.state, areas: post.areas, source: 'indiapost' };
  else if (post && !post.found) body = { ok: true, pincode: pin, city: '', state: stateFromPin(pin), areas: [], source: 'unknown-pin' };
  else body = { ok: true, pincode: pin, city: '', state: stateFromPin(pin), areas: [], source: 'prefix' };

  // Only keep full answers for a week; retry India Post sooner after a timeout.
  if (body.source === 'indiapost') cache.set(pin, { at: Date.now(), body });
  if (cache.size > 20000) cache.clear();
  return body;
}

module.exports = { lookupPincode, stateFromPin, tidyCity };
