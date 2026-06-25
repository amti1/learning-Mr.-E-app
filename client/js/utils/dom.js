// DOM helper utilities
export const $ = (sel, ctx = document) => ctx.querySelector(sel);
export const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

export function createElement(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [key, val] of Object.entries(attrs)) {
    if (key === 'className') el.className = val;
    else if (key === 'dataset') Object.assign(el.dataset, val);
    else if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), val);
    else el.setAttribute(key, val);
  }
  for (const child of (Array.isArray(children) ? children : [children])) {
    if (typeof child === 'string') el.appendChild(document.createTextNode(child));
    else if (child instanceof Node) el.appendChild(child);
  }
  return el;
}

export function on(el, event, handler, opts) {
  if (typeof el === 'string') el = $(el);
  if (el) el.addEventListener(event, handler, opts);
}

export function delegate(parent, event, selector, handler) {
  const el = typeof parent === 'string' ? $(parent) : parent;
  if (!el) return;
  el.addEventListener(event, (e) => {
    const target = e.target.closest(selector);
    if (target && el.contains(target)) handler(e, target);
  });
}

export function show(el) { if (typeof el === 'string') el = $(el); if (el) el.style.display = ''; }
export function hide(el) { if (typeof el === 'string') el = $(el); if (el) el.style.display = 'none'; }
export function toggle(el) { if (typeof el === 'string') el = $(el); if (el) el.style.display = el.style.display === 'none' ? '' : 'none'; }
export function addClass(el, ...cls) { if (typeof el === 'string') el = $(el); if (el) el.classList.add(...cls); }
export function removeClass(el, ...cls) { if (typeof el === 'string') el = $(el); if (el) el.classList.remove(...cls); }

export function animate(el, animationClass, duration = 300) {
  if (typeof el === 'string') el = $(el);
  if (!el) return Promise.resolve();
  return new Promise(resolve => {
    el.classList.add(animationClass);
    setTimeout(() => { el.classList.remove(animationClass); resolve(); }, duration);
  });
}

export function setHTML(selector, html) {
  const el = typeof selector === 'string' ? $(selector) : selector;
  if (el) el.innerHTML = html;
}

export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
