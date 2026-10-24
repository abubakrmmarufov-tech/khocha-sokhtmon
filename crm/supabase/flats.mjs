// Writes the flats into schema.sql (between its "flats: begin" and "flats: end" lines) from the
// site's model: the same ids and numbers as src/data.js (a flat of floor F, index i on its plan is
// `${tower}${F}-${i}`; numbers run on from floor to floor), areas and rooms from the plans.
//   node crm/supabase/flats.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const complex = JSON.parse(readFileSync(new URL('src/model/complex.json', root)));
const plans = JSON.parse(readFileSync(new URL('src/model/plans.json', root)));

const rows = [];
for (const tower of complex.towers.filter((t) => t.sales)) {
  let number = 0;
  for (const fl of tower.floors) {
    plans[fl.plan].apartments.forEach((a, i) => {
      rows.push(`  ('${tower.key}${fl.floor}-${i}', ${++number}, ${fl.floor}, ${a.rooms_count}, ${a.area})`);
    });
  }
}
const sql = `insert into public.flats (id, number, floor, rooms, area) values
${rows.join(',\n')}
on conflict (id) do update set number = excluded.number, floor = excluded.floor, rooms = excluded.rooms, area = excluded.area;`;

const file = new URL('crm/supabase/schema.sql', root);
const text = readFileSync(file, 'utf8');
if (!/-- flats: begin[^\n]*\n[\s\S]*?-- flats: end/.test(text)) throw new Error('no "-- flats: begin" / "-- flats: end" lines in schema.sql');
const out = text.replace(/(-- flats: begin[^\n]*\n)[\s\S]*?(-- flats: end)/, `$1${sql}\n$2`);
writeFileSync(file, out);
console.log(`${rows.length} flats written`);
