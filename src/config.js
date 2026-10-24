// The house of «Хоча сохтмон»: its floor levels come from the Blender build (model/complex.json,
// blender/build.py); apartments, rooms and walls from the architect's sketch of the typical floor
// (model/plans.json, tools/plan/extract.py).
import complex from './model/complex.json';
import plans from './model/plans.json';

export const MODEL_URL = `${import.meta.env.BASE_URL}models/house.glb`;
// the grounds (lawns, roads, kerbs, benches...), a file of their own loaded after the house
// (tools/pack_model.mjs): on a slow line the house shows first
export const SITE_URL = MODEL_URL.replace(/house(\.[a-z]+)$/, 'site$1');
export const PLANS = plans;

// The sales CRM's database (crm/, Supabase: Project URL and the publishable / anon key from
// Project Settings -> API), written here or given to the build as VITE_SALES_URL / VITE_SALES_KEY.
// The key is public by design: what it may read is set by the database's rules
// (crm/supabase/schema.sql), the 3D site only the list of sold and reserved flats. Left empty, the
// CRM runs as a demo kept in the browser, and this site shows the demo's statuses in that browser only.
export const SALES = {
  url: import.meta.env.VITE_SALES_URL ?? '',
  key: import.meta.env.VITE_SALES_KEY ?? '',
};

// Site plan coordinates (metres, x east, y north) -> scene (x, z) with the site centre at the origin.
const [CX, CY] = complex.site_centre;
export const toScene = (x, y) => ({ x: x - CX, z: -(y - CY) });

export const TOWERS = complex.towers;
export const RESIDENTIAL = TOWERS.filter((t) => t.sales);
export const towerByKey = Object.fromEntries(TOWERS.map((t) => [t.key, t]));
export const TREES = { protos: complex.tree_protos ?? [], list: complex.trees ?? [], placed: complex.trees_placed ?? [],
  terrace: complex.terrace_plants ?? [] };
export const CARS = complex.cars ?? [];
export const PALMS = complex.palms ?? [];
export const PEOPLE = complex.people ?? [];
export const LAMPS = complex.lamps ?? [];
export const PLACES = complex.labels ?? [];
// block letters as written on the drawings
export const LETTER = { A: 'А', B: 'Б', V: 'В', G: 'Г', D: 'Д' };

// A tower's floor plans are drawn in its own frame. In the scene, a group at `position` turned by
// `rotY` holds plan point (x, y) at local (x, height, -y).
export function planFrame(t) {
  const a = (t.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const [px, py] = t.plan_centre;
  const o = toScene(t.centre[0] - (c * px - s * py), t.centre[1] - (s * px + c * py));
  return {
    position: { x: o.x, z: o.z },
    rotY: a,
    toScene: (x, y) => ({ x: o.x + c * x - s * y, z: o.z - (s * x + c * y) }),
    toPlan: (X, Z) => {
      const dx = X - o.x, dy = -(Z - o.z);
      return { x: c * dx + s * dy, y: -s * dx + c * dy };
    },
    // plan direction -> site compass bearing (0 = north, 90 = east)
    bearing: (dx, dy) => {
      const ex = c * dx - s * dy, ny = s * dx + c * dy;
      return ((Math.atan2(ex, ny) * 180) / Math.PI + 360) % 360;
    },
  };
}
