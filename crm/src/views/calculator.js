// The credit calculator: a price (a flat's from the price list, or any sum) and terms -> the monthly
// payment, the interest and the whole schedule; a free flat can be sold on those terms straight away.
import { T } from '../i18n.js';
import * as db from '../db.js';
import { apartments } from '../../../src/data.js';
import { addMonths, money, num, parseNum, today } from '../fmt.js';
import { opts, wireSegs } from '../ui.js';
import { previewHtml, readTerms, termsHtml, wireTerms } from './terms.js';
import { flatState } from './board.js';
import { dealForm } from './deal.js';

const calc = { flat: '', price: 500000, plan: 'installment', down_payment: 150000, term: 24, rate: 0, method: 'annuity', first_due: null };

export const calculator = {
  title: () => T().calcTitle,
  keep: true, // (not redrawn when the records change: it would wipe what is being typed)
  render(el) {
    const L = T();
    const states = apartments.map(flatState).filter((x) => x.status === 'free' && x.price > 0).sort((a, b) => a.a.number - b.a.number);
    const day = today();
    if (!calc.first_due) calc.first_due = addMonths(day, 1);
    el.innerHTML = `
      <div class="page-head"><div><h1>${L.calcTitle}</h1><div class="sub">${L.calcSub}</div></div></div>
      <div class="calc-grid">
        <form class="card calc-form" novalidate>
          <div class="grid2">
            <label>${L.calcFlat}<select name="flat"><option value="">${L.anyPrice}</option>
              ${opts(states.map((x) => [x.a.id, `${L.flat(x.a.number)} · ${L.roomsN(x.a.rooms)} · ${num(x.a.area)} ${L.m2} · ${money(x.price)}`]), calc.flat)}</select></label>
            <label>${L.price}<input name="price" inputmode="decimal" value="${num(calc.price)}"></label>
          </div>
          ${termsHtml(calc, calc.price)}
          <div class="actions"><button type="button" class="btn primary" data-act="deal" ${calc.flat ? '' : 'hidden'}>${L.makeDeal}</button></div>
        </form>
        <div class="card calc-out"></div>
      </div>`;
    const form = el.querySelector('form');
    const f = form.elements;
    const price = () => parseNum(f.price.value);
    const update = () => {
      const t = readTerms(form, price(), day);
      Object.assign(calc, t, { flat: f.flat.value, price: price() });
      el.querySelector('.calc-out').innerHTML = `<h3>${L.schedule}</h3>${previewHtml(t)}`;
      form.querySelector('[data-act="deal"]').hidden = !calc.flat;
    };
    wireSegs(form, update);
    wireTerms(form, price, update);
    f.flat.onchange = () => {
      const x = states.find((s) => s.a.id === f.flat.value);
      if (x) {
        f.price.value = num(x.price);
        form.dispatchEvent(new Event('price-changed'));
      }
      update();
    };
    f.price.addEventListener('input', () => form.dispatchEvent(new Event('price-changed')));
    form.querySelector('[data-act="deal"]').onclick = () => {
      const t = readTerms(form, price(), day);
      dealForm({ flatId: calc.flat, kind: 'sale', terms: { ...t, date: day } });
    };
    update();
  },
};
