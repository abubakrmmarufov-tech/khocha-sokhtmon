// The pieces every page uses: the side drawer (a flat, a deal, a client), dialogs with a form,
// confirmations, the toast, status badges and downloads.
import { T } from './i18n.js';
import { esc } from './fmt.js';

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

// ---------- toast ----------
let toastTimer;
export function toast(msg, kind = 'ok') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = ''), kind === 'bad' ? 6000 : 2600);
}
// run an action, saying what went wrong if it did; true when it went through
export async function attempt(fn, done) {
  try {
    await fn();
    if (done) toast(done);
    return true;
  } catch (e) {
    console.error(e);
    toast(T().failed(e.message ?? e), 'bad');
    return false;
  }
}

// ---------- the drawer: one panel on the right, drawn again whenever the records change ----------
// view: { render(el), act?(name, button) }
let drawer = null;
export function openDrawer(view) {
  drawer = view;
  const box = $('#drawer');
  box.hidden = false;
  box.querySelector('.body').scrollTop = 0;
  drawDrawer();
}
export function drawDrawer() {
  if (!drawer) return;
  const body = $('#drawer .body');
  const keep = body.scrollTop;
  drawer.render(body);
  body.scrollTop = keep;
}
export function closeDrawer() {
  drawer = null;
  $('#drawer').hidden = true;
}
export const drawerOpen = () => !!drawer;
document.addEventListener('click', (e) => {
  const box = $('#drawer');
  if (!drawer || !box.contains(e.target)) return;
  if (e.target === box || e.target.closest('[data-act="close-drawer"]')) return closeDrawer();
  const b = e.target.closest('[data-act]');
  if (b && drawer.act) drawer.act(b.dataset.act, b);
});

// ---------- dialogs ----------
// A form in a dialog. body: its html; mount(form): wire it up (live totals...); submit(form): save,
// throw to keep it open (an Error with .field marks that field). Resolves true when saved.
export function dialog({ title, body, submitText = T().save, danger = false, wide = false, mount, submit, cancelText = T().cancel }) {
  return new Promise((resolve) => {
    const root = $('#dialogs');
    const wrap = document.createElement('div');
    wrap.className = 'dialog-wrap';
    wrap.innerHTML = `<form class="dialog ${wide ? 'wide' : ''}" novalidate>
      <div class="dialog-head"><h3>${esc(title)}</h3><button type="button" class="icon-btn" data-x aria-label="${esc(T().close)}">✕</button></div>
      <div class="dialog-body">${body}</div>
      <div class="dialog-foot"><span class="err"></span>
        <button type="button" class="btn" data-x>${esc(cancelText)}</button>
        ${submit ? `<button type="submit" class="btn ${danger ? 'danger' : 'primary'}">${esc(submitText)}</button>` : ''}
      </div></form>`;
    root.append(wrap);
    const form = wrap.querySelector('form');
    const done = (ok) => {
      wrap.remove();
      document.removeEventListener('keydown', onKey);
      resolve(ok);
    };
    const onKey = (e) => {
      if (e.key === 'Escape' && root.lastElementChild === wrap) done(false);
    };
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap || e.target.closest('[data-x]')) done(false);
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('[type="submit"]');
      form.querySelectorAll('.bad').forEach((el) => el.classList.remove('bad'));
      form.querySelector('.err').textContent = '';
      btn.disabled = true;
      try {
        await submit(form);
        done(true);
      } catch (err) {
        btn.disabled = false;
        console.error(err);
        const f = err.field && form.elements[err.field];
        if (f) {
          (f.closest?.('label') ?? f).classList?.add('bad');
          f.focus?.();
        }
        form.querySelector('.err').textContent = err.message ?? String(err);
      }
    });
    mount?.(form);
    form.querySelector('input:not([type="hidden"]):not([readonly]), select, textarea')?.focus();
  });
}
export function fieldError(field, message) {
  const e = new Error(message);
  e.field = field;
  return e;
}
export function confirmBox(text, { ok = T().yes, danger = false, title = '' } = {}) {
  return dialog({ title: title || T().sureDelete, body: `<p class="confirm">${esc(text)}</p>`, submitText: ok, danger, submit: () => {} });
}

// ---------- small html helpers ----------
export const chip = (cls, text) => `<span class="chip ${cls}">${esc(text)}</span>`;
export const statusChip = (s, expired = false) => chip(`st-${s}${expired ? ' expired' : ''}`, expired ? T().expired : T().status[s]);
export const stateChip = (s) => chip(`ds-${s}`, T().dealState[s]);
export const opts = (list, value) =>
  list.map(([v, label]) => `<option value="${esc(v)}" ${String(v) === String(value ?? '') ? 'selected' : ''}>${esc(label)}</option>`).join('');
export const seg = (name, list, value) =>
  `<div class="seg" data-seg="${name}">${list.map(([v, label]) => `<button type="button" data-v="${esc(v)}" class="${String(v) === String(value) ? 'on' : ''}">${esc(label)}</button>`).join('')}</div>`;
// a segmented choice inside a form keeps its value in a hidden input of the same name
export function segInput(name, list, value) {
  return `<input type="hidden" name="${name}" value="${esc(value)}">${seg(name, list, value)}`;
}
export function wireSegs(form, onChange) {
  form.addEventListener('click', (e) => {
    const b = e.target.closest('[data-seg] button');
    if (!b) return;
    const box = b.closest('[data-seg]');
    box.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    const input = form.elements[box.dataset.seg];
    if (input) input.value = b.dataset.v;
    onChange?.(box.dataset.seg, b.dataset.v);
  });
}

// ---------- files ----------
export function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
// a table for Excel: semicolons and a decimal comma (as Excel reads it with Russian settings), UTF-8
// with its mark so the Cyrillic shows
export function csv(name, header, rows) {
  const cell = (v) => {
    let s = typeof v === 'number' ? String(v).replace('.', ',') : String(v ?? '');
    if (/[";\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const text = `﻿${[header, ...rows].map((r) => r.map(cell).join(';')).join('\r\n')}`;
  download(name, text, 'text/csv;charset=utf-8');
}
