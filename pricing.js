'use strict';

/*
 * Server-side pricing for kritsleep.in.
 *
 * The server uses this to work out what a customer actually owes, so the
 * amount charged on Razorpay never comes from the browser.
 *
 * PRODUCT PRICES come from assets/krit-products.js — the same file the
 * pages use — so change prices there only.
 *
 * COUPONS AND FEES below must match the constants at the top of the
 * checkout script in checkout.html. If they ever disagree, this file wins
 * and the customer is shown the corrected total before paying.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadProducts() {
  const source = fs.readFileSync(path.join(__dirname, 'assets', 'krit-products.js'), 'utf8');
  const sandbox = {};
  vm.runInNewContext(source + '\n;this.list = KRIT_PRODUCTS;', sandbox, { timeout: 1000 });
  const list = (sandbox.list || []).map((p) => ({ id: String(p.id), name: String(p.name), price: Number(p.price) }));
  if (!list.length || list.some((p) => !p.id || !p.name || !(p.price > 0))) {
    throw new Error('assets/krit-products.js has a product without an id, name or price.');
  }
  return list;
}

const PRODUCTS = loadProducts();

const COUPONS = [
  { code: 'FLAT200', kind: 'flat', value: 200, min: 1499 },
  { code: 'SLEEP500', kind: 'flat', value: 500, min: 3999 }
];

const PREPAID_DISCOUNT = 50; // Rs off for paying online
const COD_FEE = 49;          // Rs added for cash on delivery
const SHIPPING = 0;          // Rs, currently free
const MAX_QTY_PER_LINE = 20;

/* Cart items carry a product id; older cart entries may only have a name
   like "Contour Pillow (20 x 12 x 3 inch)", so fall back to the name. */
function findProduct(item) {
  const id = String((item && (item.id || item.product_id || item.sku)) || '').trim();
  if (id) {
    const byId = PRODUCTS.find((p) => p.id === id);
    if (byId) return byId;
  }
  const name = String((item && (item.name || item.description)) || '').trim().toLowerCase();
  if (!name) return null;
  return PRODUCTS.find((p) => name.startsWith(p.name.toLowerCase())) || null;
}

/*
 * Works out the order total from product ids and quantities only.
 * Returns { ok: true, lines, subtotal, discount, couponCode, paymentAdjust,
 * shipping, total } or { ok: false, error }.
 */
function priceOrder({ items, couponCode, paymentMode }) {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: 'Your cart is empty.' };
  }

  const lines = [];
  for (const item of items) {
    const product = findProduct(item);
    if (!product) {
      return { ok: false, error: 'One of the items in your cart is no longer available. Please refresh and try again.' };
    }
    const qty = Math.floor(Number(item.qty || 1));
    if (!Number.isFinite(qty) || qty < 1 || qty > MAX_QTY_PER_LINE) {
      return { ok: false, error: `Quantity must be between 1 and ${MAX_QTY_PER_LINE}.` };
    }
    lines.push({ id: product.id, qty, price: product.price, amount: product.price * qty });
  }

  const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);

  let discount = 0;
  let appliedCoupon = '';
  const code = String(couponCode || '').trim().toUpperCase();
  if (code) {
    const coupon = COUPONS.find((c) => c.code === code);
    if (coupon && subtotal >= coupon.min) {
      discount = coupon.kind === 'percent'
        ? Math.round(subtotal * coupon.value / 100)
        : Math.min(coupon.value, subtotal);
      appliedCoupon = coupon.code;
    }
  }

  const isCod = String(paymentMode || '').toLowerCase() === 'cod';
  const paymentAdjust = isCod ? COD_FEE : -PREPAID_DISCOUNT;
  const shipping = isCod ? 0 : SHIPPING;
  const total = Math.max(0, subtotal - discount + shipping + paymentAdjust);

  return { ok: true, lines, subtotal, discount, couponCode: appliedCoupon, paymentAdjust, shipping, total };
}

module.exports = { PRODUCTS, priceOrder, findProduct };
