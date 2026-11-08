'use strict';
// Copy of krit-erp/src/delivery.js — used only when the ERP cannot be reached.

/*
 * Delivery date for a customer PIN code, shipped from the KRIT warehouse
 * (Kudlu, Bengaluru).
 *
 *   dispatch day  = today if the order comes in before the cut-off (2 PM IST)
 *                   and it isn't Sunday; otherwise the next working day
 *   delivery date = dispatch day + courier transit days (Sundays skipped)
 *
 * Transit days come from Shiprocket (the courier Shiprocket recommends for
 * that PIN, COD or prepaid). If Shiprocket isn't connected or doesn't answer,
 * a regional estimate is used, so the shopper always sees a date.
 */

const CUTOFF_HOUR_IST = Number(process.env.DISPATCH_CUTOFF_HOUR || 14);
const CACHE_MS = 6 * 60 * 60 * 1000;
const DEFAULT_WAREHOUSE_PIN = '560068'; // Kudlu, Bengaluru

// ── IST calendar helpers (the server may run in another time zone) ──
function istParts(date) {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false, weekday: 'short'
  }).formatToParts(date);
  const get = (t) => (p.find((x) => x.type === t) || {}).value;
  return { y: +get('year'), m: +get('month'), d: +get('day'), hour: +get('hour') % 24, weekday: get('weekday') };
}
// A calendar day as a UTC-noon Date, so adding days never trips over time zones.
function dayOf(y, m, d) { return new Date(Date.UTC(y, m - 1, d, 12)); }
function addDays(day, n) { return new Date(day.getTime() + n * 86400000); }
function isSunday(day) { return day.getUTCDay() === 0; }
function nextWorkingDay(day) { let d = addDays(day, 1); while (isSunday(d)) d = addDays(d, 1); return d; }
function addWorkingDays(day, n) { let d = day; for (let i = 0; i < n; i++) d = nextWorkingDay(d); return d; }
function ymd(day) { return day.toISOString().slice(0, 10); }

function dispatchDay(now = new Date()) {
  const t = istParts(now);
  const today = dayOf(t.y, t.m, t.d);
  if (!isSunday(today) && t.hour < CUTOFF_HOUR_IST) return { day: today, sameDay: true };
  return { day: isSunday(today) ? nextWorkingDay(addDays(today, -1)) : nextWorkingDay(today), sameDay: false };
}

// ── Regional fallback (transit days from Bengaluru) ──
function regionalDays(pin) {
  // Same bands as the Shipping Info policy on the website (max of each range).
  const p = String(pin);
  const p2 = +p.slice(0, 2), p3 = +p.slice(0, 3);
  if (p3 === 560 || p3 === 562) return { min: 1, max: 2, region: 'Bengaluru' };
  if ([400, 110, 600, 500, 411, 700, 122, 201, 121].includes(p3)) return { min: 2, max: 3, region: 'Metro city' };
  if (p3 === 744 || (p2 >= 78 && p2 <= 79) || (p2 >= 18 && p2 <= 19) || p3 === 194) return { min: 7, max: 10, region: 'J&K / North-East / islands' };
  if (p2 >= 56 && p2 <= 59) return { min: 2, max: 3, region: 'Karnataka' };
  if ((p2 >= 60 && p2 <= 69) || (p2 >= 50 && p2 <= 53)) return { min: 3, max: 4, region: 'South India' };
  return { min: 3, max: 5, region: 'Rest of India' };
}

function createDelivery({ shiprocket, setting }) {
  const cache = new Map();
  let pickupCache = { at: 0, pin: '' };

  async function warehousePin() {
    if (shiprocket && shiprocket.configured() && Date.now() - pickupCache.at < CACHE_MS && pickupCache.pin) return pickupCache.pin;
    let pin = '';
    if (shiprocket && shiprocket.configured()) {
      try {
        const list = await shiprocket.pickupLocations();
        const name = setting('shiprocket_pickup', '');
        const pick = list.find((l) => l.name === name) || list[0];
        pin = pick && /^\d{6}$/.test(pick.pincode) ? pick.pincode : '';
      } catch (e) { /* use the saved/default PIN */ }
    }
    pin = pin || String(setting('warehouse_pincode', '') || DEFAULT_WAREHOUSE_PIN);
    pickupCache = { at: Date.now(), pin };
    return pin;
  }

  function build({ pincode, cod, days, maxDays, source, courier, region, now }) {
    const dispatch = dispatchDay(now);
    const date = addWorkingDays(dispatch.day, days);
    const latest = maxDays && maxDays > days ? addWorkingDays(dispatch.day, maxDays) : date;
    return {
      ok: true, serviceable: true, pincode, cod: !!cod,
      date: ymd(date), latestDate: ymd(latest),
      dispatchDate: ymd(dispatch.day), dispatchToday: dispatch.sameDay,
      transitDays: days, source, courier: courier || '', region: region || '',
      cutoffHourIST: CUTOFF_HOUR_IST
    };
  }

  async function estimate({ pincode, cod = false, weightKg = 1, value = 2000, now = new Date() }) {
    const pin = String(pincode || '').trim();
    if (!/^[1-9]\d{5}$/.test(pin)) return { ok: false, error: 'Enter a valid 6-digit PIN code.' };
    const key = `${pin}|${cod ? 1 : 0}`;
    const hit = cache.get(key);
    let transit = hit && Date.now() - hit.at < CACHE_MS ? hit.transit : null;

    if (!transit && shiprocket && shiprocket.configured()) {
      try {
        const from = await warehousePin();
        const r = await shiprocket.rates({ pickupPincode: from, deliveryPincode: pin, weightKg, cod, declaredValue: value });
        if (!r.couriers.length) {
          transit = { none: true };
        } else {
          const rec = r.couriers.find((c) => c.id === r.recommendedId) || r.couriers[0];
          const days = parseInt(rec.days, 10);
          const fastest = Math.min(...r.couriers.map((c) => parseInt(c.days, 10)).filter((n) => n > 0));
          transit = days > 0
            ? { days, maxDays: days, source: 'shiprocket', courier: rec.name, fastest: Number.isFinite(fastest) ? fastest : days }
            : null;
        }
      } catch (e) {
        console.warn('Delivery estimate (Shiprocket) failed for', pin, e.message);
      }
      if (transit) cache.set(key, { at: Date.now(), transit });
    }

    if (transit && transit.none) {
      return { ok: true, serviceable: false, pincode: pin, cod: !!cod, error: cod ? 'Cash on delivery is not available for this PIN code. Please pay online.' : 'Sorry, couriers do not deliver to this PIN code yet.' };
    }
    if (!transit) {
      const r = regionalDays(pin);
      return build({ pincode: pin, cod, days: r.max, maxDays: r.max, source: 'estimate', region: r.region, now });
    }
    return build({ pincode: pin, cod, days: transit.days, maxDays: transit.maxDays, source: transit.source, courier: transit.courier, now });
  }

  return { estimate, warehousePin };
}

module.exports = { createDelivery, dispatchDay, regionalDays, addWorkingDays, istParts };
