// Settings: the connection (and how to set up the database), the seller's name and the currency,
// the staff and their roles, exports to Excel, a backup copy, and the demo's own buttons.
import { T } from '../i18n.js';
import * as db from '../db.js';
import { apartments } from '../../../src/data.js';
import schemaSql from '../../supabase/schema.sql?raw';
import { esc, fdate } from '../fmt.js';
import { attempt, confirmBox, csv, dialog, download, fieldError, opts } from '../ui.js';
import { flatState } from './board.js';
import { exportDeals, exportPayments, exportSchedule } from './lists.js';

export const settings = {
  title: () => T().nav.settings,
  render(el) {
    const L = T();
    const admin = db.isAdmin();
    const demo = db.session.mode === 'demo';
    const staff = [...db.data.staff.values()].sort((a, b) => a.email.localeCompare(b.email));
    el.innerHTML = `
      <div class="page-head"><div><h1>${L.nav.settings}</h1><div class="sub">${esc(db.session.user?.name ?? '')} · ${L.roles[db.session.user?.role] ?? ''}</div></div></div>
      <div class="settings">
        <section class="card">
          <h3>${L.connection}</h3>
          <p>${demo ? L.modeDemo : esc(L.modeCloud(db.session.url))}</p>
          ${demo ? `<h4>${L.setupTitle}</h4><ol class="steps">${L.setupSteps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>
            <div class="actions"><button class="btn" data-act="schema">schema.sql</button></div>` : ''}
        </section>
        <section class="card">
          <h3>${L.general}</h3>
          <form class="grid2 general" novalidate>
            <label>${L.company}<input name="company" value="${esc(db.setting('company', ''))}" ${admin ? '' : 'disabled'}></label>
            <label>${L.currency}<select name="currency" ${admin ? '' : 'disabled'}>${opts(Object.entries(L.currencies), db.setting('currency', 'TJS'))}</select></label>
          </form>
        </section>
        <section class="card">
          <h3>${L.staff}</h3>
          <p class="hint">${demo ? L.staffDemo : L.staffNote}</p>
          <p class="hint">${L.roleNote}</p>
          <table class="list">
            <thead><tr><th>${L.email}</th><th>${L.name}</th><th>${L.role}</th><th></th></tr></thead>
            <tbody>${staff.map((s) => `<tr><td>${esc(s.email)}${s.email === db.session.user?.email ? ` <span class="muted">(${L.you})</span>` : ''}</td><td>${esc(s.name ?? '')}</td>
              <td>${L.roles[s.role] ?? esc(s.role)}</td>
              <td>${admin && !demo && s.email !== db.session.user?.email ? `<button class="btn small" data-act="staff" data-email="${esc(s.email)}">${L.edit}</button>
                <button class="icon-btn" data-act="unstaff" data-email="${esc(s.email)}" title="${L.del}">✕</button>` : ''}</td></tr>`).join('')}</tbody>
          </table>
          ${admin && !demo ? `<div class="actions"><button class="btn" data-act="staff">${L.addStaff}</button></div>` : ''}
        </section>
        <section class="card">
          <h3>${L.exports}</h3>
          <div class="actions">
            <button class="btn" data-act="x-flats">${L.exportFlats}</button>
            <button class="btn" data-act="x-deals">${L.exportDeals}</button>
            <button class="btn" data-act="x-payments">${L.exportPayments}</button>
            <button class="btn" data-act="x-schedule">${L.exportSchedule}</button>
          </div>
        </section>
        <section class="card">
          <h3>${L.backup}</h3>
          <p class="hint">${L.backupNote}</p>
          <div class="actions">
            <button class="btn" data-act="backup">${L.exportJson}</button>
            ${admin ? `<label class="btn file">${L.importJson}<input type="file" accept="application/json,.json" data-act="restore" hidden></label>` : ''}
          </div>
        </section>
        ${demo ? `<section class="card">
          <h3>${L.demoUser}</h3>
          <div class="actions"><button class="btn" data-act="demo-reset">${L.demoReset}</button><button class="btn ghost danger" data-act="demo-clear">${L.demoClear}</button></div>
        </section>` : ''}
      </div>`;

    const general = el.querySelector('.general');
    general.onchange = (e) => attempt(() => db.setSetting(e.target.name, e.target.value.trim()), L.saved);
    el.onclick = async (e) => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      const a = b.dataset.act;
      if (a === 'schema') download('schema.sql', schemaSql, 'text/plain;charset=utf-8');
      else if (a === 'x-flats') exportFlats();
      else if (a === 'x-deals') exportDeals();
      else if (a === 'x-payments') exportPayments();
      else if (a === 'x-schedule') exportSchedule();
      else if (a === 'backup') download(`crm-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(db.dump(), null, 1), 'application/json');
      else if (a === 'staff') staffForm(b.dataset.email);
      else if (a === 'unstaff') {
        if (await confirmBox(b.dataset.email, { ok: L.del, danger: true })) attempt(() => db.remove('staff', b.dataset.email), L.deleted);
      } else if (a === 'demo-reset') {
        if (await confirmBox(L.demoResetQ, { ok: L.demoReset, title: L.demoReset })) db.demoReset(true);
      } else if (a === 'demo-clear') {
        if (await confirmBox(L.demoClearQ, { ok: L.demoClear, danger: true, title: L.demoClear })) db.demoReset(false);
      }
    };
    el.querySelector('[data-act="restore"]')?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      let copy;
      try {
        copy = JSON.parse(await file.text());
      } catch {
        return attempt(() => Promise.reject(new Error(L.badFile)));
      }
      if (await confirmBox(L.importQ, { ok: L.importJson, title: L.importJson })) {
        let n = 0;
        await attempt(async () => (n = await db.restore(copy)));
        if (n) attempt(() => Promise.resolve(), L.imported(n));
      }
      e.target.value = '';
    });
  },
};

function staffForm(email) {
  const L = T();
  const s = email ? db.data.staff.get(email) : {};
  return dialog({
    title: email ?? L.addStaff,
    body: `<div class="grid2">
        <label>${L.email} *<input name="email" type="email" value="${esc(s.email ?? '')}" ${email ? 'readonly' : ''}></label>
        <label>${L.name}<input name="name" value="${esc(s.name ?? '')}"></label>
        <label>${L.role}<select name="role">${opts(Object.entries(L.roles), s.role ?? 'manager')}</select></label>
      </div><p class="hint">${L.staffNote}</p>`,
    async submit(form) {
      const f = form.elements;
      const mail = f.email.value.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) throw fieldError('email', L.required);
      await db.save('staff', { email: mail, name: f.name.value.trim(), role: f.role.value });
    },
  });
}

function exportFlats() {
  const L = T();
  csv('flats.csv', [L.flatLong(''), L.floor, L.rooms, L.area, L.priceM2, L.listPrice, L.legend, L.client, L.phone, L.date, L.dealPrice, L.paid, L.balance],
    apartments.map(flatState).map((x) => {
      const row = db.flatRow(x.a.id), i = x.info;
      return [x.a.number, x.a.floor, x.a.rooms, x.a.area, row?.price_m2 ?? '', x.price || '', L.status[x.status], i?.client?.name ?? '', i?.client?.phone ?? '',
        i ? fdate(i.d.date) : '', i ? (i.d.kind === 'sale' ? i.s.total : i.d.price) : '', i ? i.s.paid : '', i && i.d.kind === 'sale' ? Math.max(0, i.s.balance) : ''];
    }));
}
