// The sales CRM of «Хоча сохтмон»: signing in, the menu, the pages (#/board, #/deals, ...), the
// language switch. The pages draw themselves from the records (db.js) and are drawn again whenever
// those change, here or (with the database) on another computer.
import './style.css';
import { BRAND } from '../../src/i18n.js';
import { T, getLang, setLang } from './i18n.js';
import * as db from './db.js';
import { esc, setCurrency } from './fmt.js';
import { $, closeDrawer, drawDrawer, drawerOpen } from './ui.js';
import { board } from './views/board.js';
import { dashboard } from './views/dashboard.js';
import { deals, payments } from './views/lists.js';
import { clients } from './views/clients.js';
import { prices } from './views/prices.js';
import { calculator } from './views/calculator.js';
import { settings } from './views/settings.js';

const VIEWS = { board, dashboard, deals, payments, clients, prices, calculator, settings };
const ICON = {
  board: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6"/>',
  dashboard: '<path d="M3 20.5h18M6 17V11M11 17V5.5M16 17v-8M21 17v-3"/>',
  deals: '<path d="M7 3h7.5L19 7.5V21H7z"/><path d="M14 3v5h5M10 12.5h6M10 16.5h6"/>',
  payments: '<rect x="2.5" y="5.5" width="19" height="13.5" rx="2.2"/><path d="M2.5 10h19M6.5 15h4"/>',
  clients: '<circle cx="12" cy="8" r="3.8"/><path d="M4.5 20.5c.4-3.8 3.6-6 7.5-6s7.1 2.2 7.5 6"/>',
  prices: '<path d="M3 12.2V3.5h8.7L20.5 12.3l-8.2 8.2z"/><circle cx="7.6" cy="8" r="1.5"/>',
  calculator: '<rect x="5" y="2.5" width="14" height="19" rx="2.2"/><path d="M8.5 7h7M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01M8.5 15h.01M12 15h.01M15.5 15h.01M8.5 18.5h.01M12 18.5h.01M15.5 18.5h.01"/>',
  settings: '<path d="M4 6.5h9M17 6.5h3M4 12h3M11 12h9M4 17.5h11M19 17.5h1"/><circle cx="15" cy="6.5" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17.5" r="2"/>',
};
const icon = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;
const route = () => {
  const r = location.hash.replace(/^#\/?/, '');
  return VIEWS[r] ? r : 'board';
};
const langSwitch = () =>
  `<div class="lang" role="group" aria-label="Язык / Забон">${['ru', 'tj'].map((l) => `<button type="button" data-lang="${l}" class="${getLang() === l ? 'on' : ''}">${l.toUpperCase()}</button>`).join('')}</div>`;
const brand = () => `<div class="brand"><div class="logo">${BRAND.ru.logo}</div><div><b>${esc(BRAND.ru.name)}</b><span>${T().app}</span></div></div>`;

// ---------- signing in ----------
function loginPage(error = '') {
  const L = T();
  const demo = db.session.mode === 'demo';
  document.title = `${L.loginTitle} · ${BRAND.ru.name}`;
  $('#app').innerHTML = `<div class="login"><form class="card login-card" novalidate>
      ${brand()}
      <h1>${L.loginTitle}</h1><p class="sub">${L.loginSub}</p>
      ${demo ? `<p class="hint">${L.demoIntro}</p>`
        : `<label>${L.email}<input name="email" type="email" autocomplete="username" required></label>
           <label>${L.password}<input name="password" type="password" autocomplete="current-password" required></label>`}
      <button class="btn primary big" type="submit">${demo ? L.demoEnter : L.signIn}</button>
      <p class="err" role="alert">${esc(error)}</p>
      ${langSwitch()}
    </form></div>`;
  const form = $('.login-card');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
      await db.signIn(form.elements.email?.value ?? '', form.elements.password?.value ?? '');
      enter();
    } catch (err) {
      loginPage(err.message);
    }
  };
  form.querySelector('input')?.focus();
}
function noAccessPage() {
  const L = T();
  $('#app').innerHTML = `<div class="login"><div class="card login-card">${brand()}
      <p>${esc(L.noAccess(db.session.user.email))}</p>
      <button class="btn" data-act="out">${L.signOut}</button>${langSwitch()}</div></div>`;
}

// ---------- the app ----------
function shell() {
  const L = T();
  const u = db.session.user;
  $('#app').innerHTML = `<div class="shell">
      <aside class="side">
        ${brand()}
        <nav>${Object.keys(VIEWS).map((k) => `<a href="#/${k}" data-view="${k}">${icon(k)}<span>${L.nav[k]}</span></a>`).join('')}</nav>
        <div class="side-foot">
          ${langSwitch()}
          <div class="me"><b>${esc(u.name)}</b><span>${L.roles[u.role] ?? ''}</span></div>
          <button class="btn small ghost-dark" data-act="out">${L.signOut}</button>
        </div>
      </aside>
      <main>
        ${db.session.mode === 'demo' ? `<div class="banner"><b>${L.demoUser}.</b> ${L.demoBanner}</div>` : ''}
        <div id="page"></div>
      </main>
    </div>`;
}
let painted = null;
function page() {
  const name = route();
  const view = VIEWS[name];
  const el = $('#page');
  if (!el) return;
  // whatever has the focus keeps it through the redraw (an input of the price list, the search box)
  const a = document.activeElement;
  let key = null, caret = null;
  if (a && el.contains(a)) {
    const attrs = ['data-id', 'data-k', 'data-open', 'data-flat', 'data-act', 'data-status', 'data-v', 'name'].filter((n) => a.hasAttribute(n));
    key = attrs.length ? attrs.map((n) => `[${n}="${CSS.escape(a.getAttribute(n))}"]`).join('') : a.classList.contains('search') ? '.search' : null;
    caret = a.selectionStart ?? null;
  }
  view.render(el);
  painted = name;
  document.title = `${view.title()} · CRM · ${BRAND.ru.name}`;
  document.querySelectorAll('.side nav a').forEach((n) => n.classList.toggle('on', n.dataset.view === name));
  if (key) {
    const n = el.querySelector(key);
    n?.focus();
    if (caret != null) try { n?.setSelectionRange(caret, caret); } catch { /* not a text input */ }
  }
}
function paint() {
  setCurrency(db.setting('currency', 'TJS'));
  shell();
  page();
  drawDrawer();
}
function enter() {
  if (!db.session.user) return loginPage();
  if (!db.session.user.role) return noAccessPage();
  paint();
}

// the records changed: draw the page again (once, after the event that changed them is over and
// the focus has moved on)
let queued = false;
db.onChange(() => {
  if (queued || !db.session.user?.role) return;
  queued = true;
  setTimeout(() => {
    queued = false;
    setCurrency(db.setting('currency', 'TJS'));
    if (!VIEWS[route()].keep || painted !== route()) page();
    drawDrawer();
  });
});
addEventListener('hashchange', () => {
  if (!db.session.user?.role) return;
  closeDrawer();
  page();
  scrollTo(0, 0);
});
document.addEventListener('click', async (e) => {
  const l = e.target.closest('[data-lang]');
  if (l) {
    setLang(l.dataset.lang);
    if (!db.session.user) loginPage();
    else if (!db.session.user.role) noAccessPage();
    else paint();
    return;
  }
  if (e.target.closest('[data-act="out"]')) {
    closeDrawer();
    await db.signOut();
    loginPage();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && drawerOpen() && !$('#dialogs').children.length) closeDrawer();
});

db.start()
  .then(enter)
  .catch((e) => {
    console.error(e);
    loginPage(T().failed(e.message ?? e));
  });
