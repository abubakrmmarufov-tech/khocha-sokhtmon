import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { LAMPS, TOWERS, planFrame, toScene, towerByKey } from './config.js';
import { bounds, interiorPoint } from './geometry.js';
import { apartments, aptsOnFloor, summaryOf } from './data.js';
import { buildWorld } from './world.js';
import { OUTLINE, loadComplex } from './building.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { buildFloor } from './floor.js';
import { WalkControls } from './walk.js';
import { drawPlan, planTransform } from './plan.js';
import { Q, setQuality } from './quality.js';
import { createRenderer, createPipeline } from './render.js';
import { setupMaterial, water } from './materials.js';
import { updateCars } from './props.js';
import { BRAND, L, getLang, num, setLang } from './i18n.js';
import { DAY, FIRST, LAST, clock as hhmm, timeOfDay } from './night.js';
import { ROOM_LIGHT } from './interior/materials.js';
import { hasStatuses, isFree, statusOf, watchSales } from './sales.js';

const $ = (s) => document.querySelector(s);
const ACCENT = 0xc8955a;
// sold (or taken off sale) and reserved flats, from the sales CRM (src/sales.js)
const TAKEN = { sold: 0xe5392f, closed: 0xe5392f, reserved: 0xf7b500 };

// ---------- static wording ----------
function applyStatic() {
  document.querySelectorAll('[data-t]').forEach((el) => {
    const v = L()[el.dataset.t];
    if (typeof v === 'string') el.textContent = v;
  });
  document.querySelectorAll('.lang button').forEach((b) => b.classList.toggle('on', b.dataset.lang === getLang()));
  $('#walk-help').innerHTML = L().walkHelp;
  const eye = $('#eye'), clean = document.body.classList.contains('clean');
  eye.title = clean ? L().showUi : L().hideUi;
  eye.setAttribute('aria-label', eye.title);
  const q = $('#quality');
  q.textContent = L().quality(Q.level === 'high');
  q.title = L().qualityTitle(Q.level === 'high');
  $('#daytime-range').setAttribute('aria-label', L().dayTime);
  $('#daytime').title = L().dayTime;
  document.title = `${L().brand} — 3D`;
  document.querySelector('.logo').textContent = BRAND[getLang()].logo;
}
applyStatic();

// ---------- the eye: hide every panel, only the view stays (and the eye, to bring them back) ----------
function setClean(on) {
  document.body.classList.toggle('clean', on);
  $('#eye').setAttribute('aria-pressed', String(on));
  $('#tooltip').style.opacity = 0;
  applyStatic();
}
$('#eye').onclick = () => setClean(!document.body.classList.contains('clean'));
document.querySelector('.lang').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-lang]');
  if (!b || b.dataset.lang === getLang()) return;
  setLang(b.dataset.lang);
  applyStatic();
  buildLabels();
  refresh();
  if (state.mode === 'walk' && walkInterior) setWalkTitle(walkInterior.apt);
});

// ---------- renderer / scene ----------
let renderer;
try {
  renderer = createRenderer();
} catch (err) {
  console.error(err);
  document.body.classList.add('no-webgl');
  $('#loading').hidden = true;
  $('#nogl').hidden = false;
  throw err;
}
$('#stage').appendChild(renderer.domElement);
const canvas = renderer.domElement;
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  $('#nogl').hidden = false;
  $('#nogl .why').textContent = L().contextLost;
});

const scene = new THREE.Scene();
// the scene stands still: the sun's shadow map is redrawn only when something changes
renderer.shadowMap.autoUpdate = false;
let shadowFrames = 2;
const shadowsDirty = () => (shadowFrames = 2);
THREE.DefaultLoadingManager.onProgress = shadowsDirty;

const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 1, 30000);
// Start view: the house from the south-west over the forecourt, as on the client's render 2.
const HOME_WIDE = { pos: new THREE.Vector3(-58, 44, 86), target: new THREE.Vector3(0, 17, 0) };
// portrait: the panel covers the lower half, so the camera aims below the house (it shows higher up)
const HOME_TALL = { pos: new THREE.Vector3(-110, 70, 170), target: new THREE.Vector3(-4, -8, 18) };
const home = () => (innerWidth < innerHeight ? HOME_TALL : HOME_WIDE);
camera.position.copy(home().pos);

const controls = new OrbitControls(camera, canvas);
controls.target.copy(home().target);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
// (not into the house: 20 m from the middle of the house or the open floor; not so far out that the
// edge of the modelled city shows)
controls.minDistance = 20;
controls.maxDistance = 260;
controls.maxPolarAngle = Math.PI * 0.48;
controls.autoRotate = false;
controls.autoRotateSpeed = 0.3;

let building = null;
const loadingEl = $('#loading');
const modelLoad = loadComplex(apartments, renderer, (k) => (loadingEl.querySelector('b').textContent = `${Math.round(k * 100)}%`));
const world = buildWorld(scene, renderer, modelLoad.then(() => {}, () => {}));
const pipeline = createPipeline(renderer, scene, camera);
const walk = new WalkControls(camera, canvas);

const HOUSE = TOWERS[0];

modelLoad
  .then((b) => {
    building = b;
    scene.add(b.group);
    setupMaterial(world.cityMat, renderer);
    shadowsDirty();
    loadingEl.hidden = true;
    refresh();
  })
  .catch((err) => {
    console.error(err);
    loadingEl.textContent = L().loadFailed;
  });

$('#quality').onclick = () => setQuality(Q.level === 'high' ? 'low' : 'high');

// ---------- time of day (src/night.js) ----------
// the slider from early morning to late night; the site starts in the afternoon light it was made for
let daytime = null;
const dtRange = $('#daytime-range'), dtClock = $('#daytime-clock');
dtRange.min = FIRST;
dtRange.max = LAST;
dtRange.step = 0.25;
dtRange.value = DAY;
function showHours(h) {
  dtClock.textContent = hhmm(h);
  const s = daytime?.state;
  $('#daytime').dataset.phase = !s ? 'day' : s.night > 0.5 ? 'night' : s.lights > 0.05 || h > 17.5 ? 'dusk' : 'day';
  dtRange.style.setProperty('--k', `${((h - FIRST) / (LAST - FIRST)) * 100}%`);
}
function setHours(h) {
  if (!daytime) return;
  daytime.set(h);
  dtRange.value = daytime.hours;
  showHours(daytime.hours);
}
showHours(DAY);
Promise.all([modelLoad, world.ready])
  .then(() => {
    daytime = timeOfDay({
      scene, renderer, world, lamps: LAMPS, toScene, cityLights: world.cityLights,
      changed: () => {
        lightIndoors();
        shadowsDirty();
      },
    });
    if (sunAz !== null) daytime.follow(sunAz);
    daytime.indoors(!!outdoor);
    $('#daytime').hidden = false;
  })
  .catch((e) => console.warn('time of day', e));
dtRange.addEventListener('input', () => setHours(+dtRange.value));
// let go of the slider: the arrow keys walk again (a focused slider would take them)
dtRange.addEventListener('pointerup', () => dtRange.blur());

// ---------- state ----------
const state = {
  mode: 'overview', // overview | floor | walk
  tower: null,
  floor: null,
  apt: null,
  hoverApt: null,
  hoverFloor: null, // { tower, floor }
  filter: { rooms: 0, free: false },
};
let dollhouse = [];
let walkInterior = null;
let lastInteraction = performance.now();

const isOpen = (a) => a.tower === state.tower && a.floor === state.floor;
const filterActive = () => state.filter.rooms > 0 || state.filter.free;
const matches = (a) => (!state.filter.rooms || a.rooms === state.filter.rooms || (state.filter.rooms === 4 && a.rooms >= 4)) && (!state.filter.free || isFree(a));
const sameFloor = (a, b) => !!a && !!b && a.tower === b.tower && a.floor === b.floor;

// ---------- camera flights ----------
let tween = null;
function flyTo(pos, target, dur = 1.2) {
  tween = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos.clone(), t1: target.clone(), t: 0, dur };
  controls.enabled = false;
}
function azimuth() {
  return Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
}
function towerCentre(k) {
  const t = towerByKey[k];
  const w = toScene(t.centre[0], t.centre[1]);
  return new THREE.Vector3(w.x, 0, w.z);
}
function floorCentre(tower, floor) {
  const list = aptsOnFloor(tower, floor);
  if (!list.length || !building) {
    const fl = towerByKey[tower].floors.find((f) => f.floor === floor);
    return towerCentre(tower).setY(fl ? fl.z : 0);
  }
  const c = new THREE.Vector3();
  for (const a of list) c.add(building.units.get(a.id).center);
  return c.divideScalar(list.length);
}
function floorView(tower, floor) {
  // from the long side nearer the camera (the flats side by side across the screen), steeply from
  // above, far enough for the whole 34 m floor to fit between the side panels
  const target = floorCentre(tower, floor);
  const fr = planFrame(towerByKey[tower]);
  const o = fr.toScene(0, 0), y1 = fr.toScene(0, 1);
  const side = Math.atan2(y1.x - o.x, y1.z - o.z);
  const az0 = azimuth();
  const off = (a) => Math.abs(Math.atan2(Math.sin(a - az0), Math.cos(a - az0)));
  const az = off(side) <= off(side + Math.PI) ? side : side + Math.PI;
  const d = 36 * (innerWidth < innerHeight ? 2.6 : 1.75);
  return { pos: target.clone().add(new THREE.Vector3(Math.sin(az) * d * 0.45, d * 0.9, Math.cos(az) * d * 0.45)), target };
}
function aptView(apt) {
  const c = building.units.get(apt.id).center;
  const target = new THREE.Vector3(c.x, c.y + 0.5, c.z);
  const tc = towerCentre(apt.tower);
  const dir = new THREE.Vector3(c.x - tc.x, 0, c.z - tc.z).normalize();
  // steeply from above the opened floor
  const tall = innerWidth < innerHeight;
  const pos = target.clone().add(dir.multiplyScalar(tall ? 14 : 15)).add(new THREE.Vector3(0, tall ? 48 : 30, 0));
  // on a portrait screen the panel covers the lower half: aim below the flat so it shows higher up
  return { pos, target: tall ? target.clone().addScaledVector(dir.normalize(), 12) : target };
}

// ---------- overlays on the building ----------
function updateOverlays() {
  showFloorBox(state.mode !== 'walk' ? state.hoverFloor?.floor : null);
  if (!building) return;
  for (const a of apartments) {
    const u = building.units.get(a.id);
    if (!u) continue;
    let show = false, color = 0xffffff, op = 0, edges = null, onFloor = false;
    const hoverFloor = sameFloor(state.hoverFloor, a);
    // sold flats show red and reserved ones yellow once their floor is pointed at or opened; the
    // building as it first appears stays as on the renders
    const taken = TAKEN[statusOf(a)];
    if (state.mode === 'overview') {
      if (hoverFloor) {
        // the floor under the pointer: amber on the white stone for the free flats, red / yellow for
        // the sold / reserved ones, with a white outline round every flat
        show = true; op = taken ? 0.72 : 0.62; edges = OUTLINE.floor; color = taken ?? 0xffa42b;
      } else if (filterActive() && matches(a)) {
        show = true; color = ACCENT; op = 0.55;
      }
    } else if (state.mode === 'floor') {
      if (isOpen(a)) {
        // the flats of the open floor: a light outline each; the one under the pointer (or chosen)
        // lit up in amber with a thick outline drawn over the walls and furniture; a sold one red,
        // a reserved one yellow (drawn on its floor: a tint and its outline, not the storey-high
        // pick volume)
        const lit = a === state.apt || a === state.hoverApt;
        show = true; onFloor = true; color = taken ?? (lit ? 0xffa42b : ACCENT);
        edges = a === state.apt ? OUTLINE.chosen : a === state.hoverApt ? OUTLINE.hover : taken ? OUTLINE[statusOf(a)] : OUTLINE.open;
        op = a === state.apt ? 0.42 : a === state.hoverApt ? 0.36 : taken ? 0.3 : 0.06;
        if (filterActive() && !matches(a)) [op, edges] = [0.0, null];
      } else if (hoverFloor && a.floor < state.floor) {
        // (a floor above the open one is cut away: nothing to light)
        show = true; op = 0.35; color = taken ?? color;
      }
    }
    const fill = onFloor ? u.tint : u.overlay;
    (onFloor ? u.overlay : u.tint).visible = false;
    fill.visible = show;
    fill.material.color.setHex(color);
    fill.material.opacity = op;
    // a floor seen from outside: the outline of every flat's volume; the open floor: each flat's
    // outline on its floor
    const line = onFloor ? u.ring : u.edges;
    (line === u.ring ? u.edges : u.ring).visible = false;
    line.visible = show && !!edges;
    if (edges) line.material = edges;
    line.renderOrder = edges === OUTLINE.hover || edges === OUTLINE.chosen ? 12 : 11;
  }
}

// ---------- tags over the apartments of the open floor ----------
const labelsEl = $('#labels');
let labels = [];
function sidesText(a) {
  return a.sides.map((s) => L().sides[s]).join(', ');
}
let liftLabels = [];
// the point a flat's tag points at: inside the flat (the point furthest from its walls), on top of
// the cut walls of the open floor
function tagAnchor(a) {
  const u = building.units.get(a.id);
  const [px, py] = interiorPoint(a.data.outline);
  const s = planFrame(towerByKey[a.tower]).toScene(px, py);
  return new THREE.Vector3(s.x, u.top + 0.15, s.z);
}
function buildLabels() {
  labelsEl.innerHTML = '';
  labels = [];
  liftLabels = [];
  if (state.mode !== 'floor') return;
  const add = (cls, html) => {
    const el = document.createElement('div');
    el.className = cls;
    el.innerHTML = html;
    const line = document.createElement('i');
    line.className = 'tag-line';
    const dot = document.createElement('i');
    dot.className = 'tag-dot';
    labelsEl.append(line, dot, el);
    return { el, line, dot };
  };
  // the lifts of the open floor, as on the drawings: how many, and their capacities
  for (const t of dollhouse[0]?.liftTags ?? []) {
    const tag = add('tag lift', `<b>${L().lifts(t.q.length)}</b><span>Q ${t.q.join(' / ')} ${L().kg}</span>`);
    liftLabels.push({ ...tag, pos: new THREE.Vector3(t.x, t.y, t.z) });
  }
  for (const a of aptsOnFloor(state.tower, state.floor)) {
    const s = statusOf(a);
    const tag = add(`tag s-${s}`, `<b>№ ${a.number}</b><span>${s === 'free' ? `${num(a.area)} ${L().m2}` : L().status[s]}</span>`);
    tag.el.title = `№ ${a.number} · ${L().roomsShort(a.rooms)} · ${num(a.area)} ${L().m2}${s === 'free' ? '' : ` · ${L().status[s]}`}`;
    tag.el.onclick = () => selectApt(a);
    tag.el.onpointerenter = () => setHover(a);
    tag.el.onpointerleave = () => setHover(null);
    labels.push({ ...tag, apt: a, pos: tagAnchor(a) });
  }
  for (const t of [...labels, ...liftLabels]) [t.w, t.h] = [t.el.offsetWidth, t.el.offsetHeight];
}
const tmp = new THREE.Vector3();
function project(v) {
  tmp.copy(v).project(camera);
  return { x: ((tmp.x + 1) / 2) * innerWidth, y: ((1 - tmp.y) / 2) * innerHeight, behind: tmp.z > 1 };
}
function updateLabels() {
  // each tag stands right over its flat, a dot and a thin line down to it; where tags would cover
  // one another, the farther one moves up (the nearer ones first, they are in front)
  const list = [];
  for (const t of [...labels, ...liftLabels]) {
    const p = project(t.pos);
    const hidden = p.behind || (t.apt && filterActive() && !matches(t.apt));
    for (const el of [t.el, t.line, t.dot]) el.style.display = hidden ? 'none' : '';
    if (!hidden) list.push({ t, p });
    if (t.apt) t.el.classList.toggle('hover', t.apt === state.hoverApt);
  }
  list.sort((p, q) => q.p.y - p.p.y);
  const placed = [];
  for (const { t, p } of list) {
    const w = t.w || 80, h = t.h || 34;
    const x0 = p.x - w / 2;
    let top = p.y - 14 - h;
    for (let i = 0; i < 8; i++) {
      const hit = placed.find((r) => x0 < r.x1 + 4 && x0 + w > r.x0 - 4 && top < r.y1 + 3 && top + h > r.y0 - 3);
      if (!hit) break;
      top = hit.y0 - 3 - h;
    }
    placed.push({ x0, x1: x0 + w, y0: top, y1: top + h });
    t.el.style.left = `${x0}px`;
    t.el.style.top = `${top}px`;
    t.dot.style.left = `${p.x}px`;
    t.dot.style.top = `${p.y}px`;
    t.line.style.left = `${p.x}px`;
    t.line.style.top = `${top + h}px`;
    t.line.style.height = `${Math.max(0, p.y - top - h)}px`;
  }
}

// ---------- panels ----------
function renderFloors() {
  const T = L();
  const t = HOUSE;
  let html = `<button class="overview-btn ${state.mode === 'overview' ? 'active' : ''}" data-act="overview">⌂ ${T.complex}</button>`;
  html += `<h3>${T.floors}</h3>`;
  for (const { floor: f } of [...t.floors].reverse()) {
    const list = aptsOnFloor(t.key, f);
    const n = list.filter(matches).length;
    const active = state.mode === 'floor' && state.floor === f;
    const hover = state.hoverFloor && state.hoverFloor.floor === f;
    const dots = hasStatuses() ? `<span class="dots">${[...list].sort((a, b) => a.number - b.number).map((a) => `<i class="s-${statusOf(a)}"></i>`).join('')}</span>` : '';
    html += `<button class="floor-btn ${active ? 'active' : ''} ${hover ? 'hover' : ''} ${filterActive() && !n ? 'dim' : ''}" data-floor="${f}">
      <span class="num">${f}</span><span class="meta">${filterActive() ? `${n} / ` : ''}${list.length ? T.flats(list.length) : '—'}${dots}</span></button>`;
  }
  html += `<button class="floor-btn lobby" disabled><span class="num">1–2</span><span class="meta">${T.shops}</span></button>`;
  $('#floors').innerHTML = html;
}
$('#floors').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.act === 'overview') goOverview();
  else if (b.dataset.floor) selectFloor(HOUSE.key, +b.dataset.floor);
});
$('#floors').addEventListener('pointerover', (e) => {
  const b = e.target.closest('[data-floor]');
  const hf = b ? { tower: HOUSE.key, floor: +b.dataset.floor } : null;
  if (JSON.stringify(hf) !== JSON.stringify(state.hoverFloor)) {
    state.hoverFloor = hf;
    updateOverlays();
  }
});
$('#floors').addEventListener('pointerleave', () => {
  state.hoverFloor = null;
  updateOverlays();
});

function roomFilter(list) {
  const T = L();
  const rooms = [...new Set(list.map((a) => Math.min(a.rooms, 4)))].sort();
  return `<div class="label">${T.rooms}</div><div class="seg" data-filter="rooms">
    ${[0, ...rooms].map((r) => `<button data-v="${r}" class="${state.filter.rooms === r ? 'on' : ''}">${r ? T.roomsShort(r) : T.all}</button>`).join('')}
  </div>${hasStatuses() ? `<label class="toggle"><input type="checkbox" data-act="free" ${state.filter.free ? 'checked' : ''}> ${T.onlyFree}</label>` : ''}`;
}

// free / reserved / sold, with how many of each (flats taken off sale count as sold here)
function salesLegend(list) {
  if (!hasStatuses()) return '';
  const T = L();
  const n = (k) => list.filter((a) => (k === 'sold' ? ['sold', 'closed'].includes(statusOf(a)) : statusOf(a) === k)).length;
  return `<div class="sales-legend">${['free', 'reserved', 'sold'].map((k) => `<span class="s-${k}"><i></i>${T.statusMany[k]} <b>${n(k)}</b></span>`).join('')}</div>`;
}

function renderSide() {
  const side = $('#side');
  const T = L();
  const range = (list, f) => {
    const v = list.map(f);
    return v.length ? [Math.min(...v), Math.max(...v)] : [0, 0];
  };
  if (state.mode === 'overview') {
    const t = HOUSE;
    const [a0, a1] = range(apartments, (a) => a.area);
    const [r0, r1] = range(apartments, (a) => a.rooms);
    side.innerHTML = `
      <h2>${T.chooseTitle}</h2>
      <div class="sub">${apartments.length ? T.chooseSub(T.floorsN(t.levels), r0, r1) : T.floorsN(t.levels)} · ${T.shopsFloors}</div>
      <div class="stats">
        <div class="stat"><b>${apartments.length || '—'}</b><span>${T.stat1}</span></div>
        <div class="stat"><b>${apartments.length ? `${num(Math.round(a0))}–${num(Math.round(a1))}` : '—'}</b><span>${T.stat2}</span></div>
        <div class="stat"><b>${t.levels}</b><span>${T.stat3}</span></div>
      </div>
      ${salesLegend(apartments)}
      ${apartments.length ? roomFilter(apartments) : ''}
      <div class="note">${apartments.length ? T.chooseNote : T.noPlans}</div>`;
  } else if (state.mode === 'floor' && !state.apt) {
    const list = aptsOnFloor(state.tower, state.floor);
    side.innerHTML = `
      <button class="back" data-act="overview">${T.backTo(T.complex)}</button>
      <h2>${T.floorN(state.floor)}</h2>
      <div class="sub">${list.length ? T.flatsOnFloor(list.length) : T.noPlans}</div>
      ${list.length ? roomFilter(list) : ''}
      <div class="apt-list">
        ${[...list].sort((a, b) => a.number - b.number).map((a) => `
          <button class="apt-row s-${statusOf(a)} ${filterActive() && !matches(a) ? 'muted' : ''}" data-apt="${a.id}">
            <span class="t">№ ${a.number}</span><span class="p">${num(a.area)} ${T.m2}</span>
            <span class="d">${T.roomsN(a.rooms)} · ${sidesText(a)}</span>${isFree(a) ? '' : `<span class="st">${T.status[statusOf(a)]}</span>`}
          </button>`).join('')}
      </div>
      ${salesLegend(list)}
      ${list.length ? `<div class="note">${T.floorNote}</div>` : ''}`;
  } else if (state.mode === 'floor' && state.apt) {
    const a = state.apt;
    side.innerHTML = `
      <button class="back" data-act="floor">${T.backTo(T.floorN(a.floor))}</button>
      <h2>${T.flat(a.number)}</h2>
      <div class="sub">${T.roomsN(a.rooms)} · ${T.floorN(a.floor)}</div>
      ${isFree(a) ? '' : `<div class="sale-badge s-${statusOf(a)}">${T.status[statusOf(a)]}</div>`}
      <div class="plan-wrap"><canvas class="plan" title="${T.planZoom}"></canvas><button class="plan-zoom" data-act="zoom" title="${T.planZoom}" aria-label="${T.planZoom}">⤢</button></div>
      <div class="area-big">${num(a.area)} <small>${T.m2}</small></div>
      <div class="specs">
        <div><span>${T.rooms}</span><b>${a.rooms}</b></div>
        <div><span>${T.floor}</span><b>${T.floorOf(a.floor, a.floors)}</b></div>
        <div><span>${T.ceiling}</span><b>${num(a.ceiling)} ${T.m}</b></div>
        <div><span>${T.windows}</span><b>${sidesText(a)}</b></div>
        <div style="grid-column: span 2"><span>${T.layout}</span><b>${summaryOf(a.data.rooms.concat(a.data.balconies))}</b></div>
      </div>
      <div class="actions">
        <button class="btn primary" data-act="walk">${T.walk}</button>
        <button class="btn" data-act="request">${T.contact}</button>
      </div>`;
    const cv = side.querySelector('.plan');
    cv.style.height = `${planHeight(a, cv.clientWidth)}px`;
    drawPlan(cv, a, { keep: { w: 44, h: 44 } }); // (clear of the zoom button in its corner)
    cv.onclick = () => openPlan(a);
  }
}
// width / height of a flat's plan with its balconies
function planAspect(a) {
  const b = bounds([...a.data.outline, ...a.data.balconies.flatMap((q) => q.poly)]);
  return (b.x1 - b.x0) / (b.y1 - b.y0);
}
// The card's plan as tall as the flat's shape asks for (a long narrow flat gets a tall plan), as far
// as the screen leaves room for the rest of the card
function planHeight(a, w) {
  const want = (w - 28) / planAspect(a) + 28;
  const most = innerWidth <= 760 ? 210 : 210 + Math.max(0, Math.min(150, innerHeight - 730));
  return Math.round(Math.min(Math.max(want, 210), most));
}
// the plan full-screen, its rooms' names and areas in larger type
function openPlan(a) {
  const box = $('#plan-big');
  box.querySelector('b').textContent = `${L().flat(a.number)} · ${num(a.area)} ${L().m2}`;
  box.querySelector('button').textContent = `✕ ${L().close}`;
  box.hidden = false;
  const pad = 24, k = planAspect(a);
  let w = Math.min(innerWidth - 68, 1100), h = (w - 2 * pad) / k + 2 * pad;
  const most = innerHeight - 130;
  if (h > most) [h, w] = [most, Math.min(w, (most - 2 * pad) * k + 2 * pad)];
  const cv = box.querySelector('canvas');
  cv.style.width = `${Math.round(w)}px`;
  cv.style.height = `${Math.round(h)}px`;
  drawPlan(cv, a, { pad, text: innerWidth <= 760 ? 1.15 : 1.45 });
}
const closePlan = () => ($('#plan-big').hidden = true);
$('#plan-big').addEventListener('click', (e) => {
  if (e.target === e.currentTarget || e.target.closest('[data-act="close"]')) closePlan();
});
$('#side').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.act === 'overview') goOverview();
  else if (b.dataset.act === 'floor') selectFloor(state.tower, state.floor);
  else if (b.dataset.act === 'walk') enterWalk(state.apt);
  else if (b.dataset.act === 'zoom') openPlan(state.apt);
  else if (b.dataset.act === 'request') toast(L().contactToast);
  else if (b.dataset.apt) selectApt(apartments.find((a) => a.id === b.dataset.apt));
  else if (b.dataset.v !== undefined) {
    state.filter.rooms = +b.dataset.v;
    refresh();
  }
});
$('#side').addEventListener('change', (e) => {
  if (e.target.dataset.act !== 'free') return;
  state.filter.free = e.target.checked;
  refresh();
});
$('#side').addEventListener('pointerover', (e) => {
  const row = e.target.closest('[data-apt]');
  setHover(row ? apartments.find((a) => a.id === row.dataset.apt) : null);
});
$('#side').addEventListener('pointerleave', () => setHover(null));

function refresh() {
  renderFloors();
  renderSide();
  if (!$('#plan-big').hidden) state.apt ? openPlan(state.apt) : closePlan();
  updateOverlays();
  const T = L();
  $('#hint').textContent = state.mode === 'overview' ? T.hintOverview : T.hintFloor;
}

let toastTimer;
function toast(msg, ms = 3000) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

function setHover(a) {
  if (state.hoverApt === a) return;
  state.hoverApt = a;
  updateOverlays();
  document.querySelectorAll('.apt-row').forEach((r) => r.classList.toggle('hover', a && r.dataset.apt === a.id));
}

// ---------- navigation ----------
function clearDollhouse() {
  dollhouse.forEach((d) => d.dispose());
  dollhouse = [];
}

// the shrubs in the top floor's terrace planters (trees of their own: src/world.js) stand and fall with
// the top floor: away when it is cut open or hidden, or walked round
function terracePlants(on) {
  scene.traverse((o) => {
    if (o.userData.tag === 'terrace') o.visible = on;
  });
}

function goOverview() {
  shadowsDirty();
  clearDollhouse();
  building?.showAll();
  terracePlants(true);
  Object.assign(state, { mode: 'overview', tower: null, floor: null, apt: null, hoverApt: null, hoverFloor: null });
  buildLabels();
  flyTo(home().pos, home().target, 1.4);
  refresh();
}

function selectFloor(tower, floor) {
  shadowsDirty();
  if (!building) return;
  if (state.tower !== tower || state.floor !== floor || state.mode !== 'floor') {
    clearDollhouse();
    building.showUpTo(tower, floor);
    terracePlants(false);
    const d = buildFloor(tower, floor, aptsOnFloor(tower, floor));
    scene.add(d.group);
    dollhouse.push(d);
  }
  Object.assign(state, { mode: 'floor', tower, floor, apt: null, hoverFloor: null });
  const v = floorView(tower, floor);
  flyTo(v.pos, v.target);
  buildLabels();
  refresh();
}

function selectApt(a) {
  if (state.mode !== 'floor' || !isOpen(a)) selectFloor(a.tower, a.floor);
  state.apt = a;
  const v = aptView(a);
  flyTo(v.pos, v.target);
  refresh();
}

function fade(fn) {
  const f = $('#fade');
  f.classList.add('on');
  setTimeout(() => {
    fn();
    requestAnimationFrame(() => requestAnimationFrame(() => f.classList.remove('on')));
  }, 380);
}

function setWalkTitle(a) {
  const T = L();
  $('#walk-title').innerHTML = `<b>№ ${a.number}</b> · ${T.roomsShort(a.rooms)} · ${num(a.area)} ${T.m2} · ${T.floorN(a.floor)}`;
}

function enterWalk(a) {
  shadowsDirty();
  fade(() => {
    clearDollhouse();
    labelsEl.innerHTML = '';
    labels = [];
    liftLabels = [];
    building.showAll(a.tower, a.floor);
    terracePlants(a.floor !== HOUSE.levels);
    walkInterior = buildFloor(a.tower, a.floor, aptsOnFloor(a.tower, a.floor), a);
    scene.add(walkInterior.group);
    shadowsDirty();
    state.mode = 'walk';
    state.hoverApt = null;
    updateOverlays();
    tween = null;
    controls.enabled = false;
    camera.fov = 72;
    camera.near = 0.05;
    frameCentre();
    pipeline.walk(true);
    lightInterior(walkInterior);
    camera.updateProjectionMatrix();
    walk.start(walkInterior, scene);
    $('#ext-ui').hidden = true;
    $('#walk-ui').hidden = false;
    document.body.classList.add('walking');
    setWalkTitle(a);
    prepareMinimap(a);
  });
}

// the sun back over its saved spot, at its saved distance, from where it stands now (the hour may
// have been changed meanwhile)
function sunBack(saved) {
  const sun = world.sun;
  const dir = sun.position.clone().sub(sun.target.position).normalize();
  sun.target.position.copy(saved.target);
  sun.position.copy(saved.target).addScaledVector(dir, saved.pos.distanceTo(saved.target));
}

// Indoors at night: the light is the rooms' own (ROOM_LIGHT on the interior's materials), the
// studio light that fills the whole scene turned down, so the street seen from the window is dark
function lightIndoors() {
  if (!outdoor) return;
  const L = daytime?.state.lights ?? 0;
  scene.environmentIntensity = 0.32 * (1 - 0.75 * L);
  bounce.intensity = 0.9 * (1 - 0.85 * L);
}

// Indoors: a studio-like environment instead of the sky, the sun's shadow pulled in round the flat.
let roomEnv = null, outdoor = null, bounce = null;
function lightInterior(interior) {
  const sun = world.sun, sc = sun.shadow.camera;
  if (interior) {
    roomEnv ??= new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
    outdoor = {
      env: scene.environment, envI: scene.environmentIntensity,
      cam: [sc.left, sc.right, sc.top, sc.bottom, sc.near, sc.far], pos: sun.position.clone(), target: sun.target.position.clone(),
    };
    scene.environment = roomEnv;
    scene.environmentIntensity = 0.32;
    bounce ??= new THREE.HemisphereLight(0xfff3e4, 0xd9c3a5, 0.9);
    scene.add(bounce);
    const c = new THREE.Box3().setFromObject(interior.group).getCenter(new THREE.Vector3());
    const dir = sun.position.clone().sub(sun.target.position).normalize();
    sun.target.position.copy(c);
    sun.position.copy(c).addScaledVector(dir, 120);
    [sc.left, sc.right, sc.top, sc.bottom, sc.near, sc.far] = [-30, 30, 30, -30, 60, 200];
  } else if (outdoor) {
    bounce?.removeFromParent();
    scene.environment = outdoor.env;
    scene.environmentIntensity = daytime ? daytime.state.env : outdoor.envI;
    [sc.left, sc.right, sc.top, sc.bottom, sc.near, sc.far] = outdoor.cam;
    sunBack(outdoor);
    outdoor = null;
  }
  daytime?.indoors(!!interior);
  lightIndoors();
  sun.target.updateMatrixWorld();
  sc.updateProjectionMatrix();
  shadowsDirty();
}

function exitWalk() {
  shadowsDirty();
  const a = walkInterior.apt;
  fade(() => {
    walk.stop();
    walkInterior.dispose();
    walkInterior = null;
    camera.fov = 38;
    camera.near = 1;
    pipeline.walk(false);
    lightInterior(null);
    camera.updateProjectionMatrix();
    controls.enabled = true;
    $('#ext-ui').hidden = false;
    $('#walk-ui').hidden = true;
    document.body.classList.remove('walking');
    state.mode = 'overview';
    frameCentre();
    camera.updateProjectionMatrix();
    selectFloor(a.tower, a.floor);
    selectApt(a);
    const v = aptView(a);
    camera.position.copy(v.pos);
    controls.target.copy(v.target);
    tween = null;
    controls.enabled = true;
  });
}
$('#exit-walk').onclick = exitWalk;
addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    if (!$('#plan-big').hidden) closePlan();
    else if (state.mode === 'walk') exitWalk();
    else if (state.mode === 'floor' && state.apt) selectFloor(state.tower, state.floor);
    else if (state.mode === 'floor') goOverview();
  }
});

// ---------- mini-map ----------
const mini = $('#minimap canvas');
let miniBg = null, miniT = null;
function prepareMinimap(a) {
  const off = document.createElement('canvas');
  off.width = mini.clientWidth;
  off.height = mini.clientHeight;
  drawPlan(off, a, { pad: 6, labels: false });
  miniBg = off;
  miniT = planTransform(a, mini.clientWidth, mini.clientHeight, 6);
}
function drawMinimap() {
  if (!miniBg || !walk.enabled) return;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = mini.clientWidth, h = mini.clientHeight;
  if (mini.width !== Math.round(w * dpr)) {
    mini.width = Math.round(w * dpr);
    mini.height = Math.round(h * dpr);
  }
  const g = mini.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, mini.width, mini.height);
  g.drawImage(miniBg, 0, 0);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const s = walk.localState();
  const x = miniT.px(s.x), y = miniT.py(s.y);
  const ang = Math.atan2(-s.dy, s.dx);
  g.fillStyle = 'rgba(200, 149, 90, 0.3)';
  g.beginPath();
  g.moveTo(x, y);
  g.arc(x, y, 30, ang - 0.6, ang + 0.6);
  g.closePath();
  g.fill();
  g.fillStyle = '#9a6a3c';
  g.strokeStyle = '#fff';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(x, y, 5, 0, Math.PI * 2);
  g.fill();
  g.stroke();
}

// ---------- joystick (touch screens) ----------
const joy = $('#joystick'), knob = joy.querySelector('.knob');
let joyId = null;
const joyMove = (e) => {
  const r = joy.getBoundingClientRect();
  let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  const max = r.width / 2 - 10, d = Math.hypot(dx, dy);
  if (d > max) { dx *= max / d; dy *= max / d; }
  knob.style.transform = `translate(${dx}px, ${dy}px)`;
  walk.setJoystick(dx / max, dy / max);
};
joy.addEventListener('pointerdown', (e) => { joyId = e.pointerId; joy.setPointerCapture(joyId); joyMove(e); });
joy.addEventListener('pointermove', (e) => e.pointerId === joyId && joyMove(e));
const joyEnd = () => { joyId = null; knob.style.transform = ''; walk.setJoystick(0, 0); };
joy.addEventListener('pointerup', joyEnd);
joy.addEventListener('pointercancel', joyEnd);
addEventListener('pointerdown', (e) => {
  lastInteraction = performance.now();
  if (e.pointerType === 'touch') document.body.classList.add('touch');
});
addEventListener('wheel', () => (lastInteraction = performance.now()), { passive: true });

// ---------- picking ----------
// Every floor of flats has an invisible box round it (hovering and clicking a floor from outside);
// the flats of the open floor have their own pick volumes (from the model). The floor under the
// pointer is lit with an amber box round it.
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const tooltip = $('#tooltip');
const floorPicks = [];
const floorBox = (() => {
  const xs = HOUSE.outline.map((p) => p[0]), ys = HOUSE.outline.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs) - 0.35, Math.max(...xs) + 0.35, Math.min(...ys) - 0.35, Math.max(...ys) + 0.35];
  const c = toScene((x0 + x1) / 2, (y0 + y1) / 2);
  for (const fl of HOUSE.floors) {
    const g = new THREE.BoxGeometry(x1 - x0, fl.h, y1 - y0);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ visible: false }));
    m.position.set(c.x, fl.z - 0.35 + fl.h / 2, c.z);
    m.userData.floor = fl.floor;
    scene.add(m);
    floorPicks.push(m);
  }
  const g = new THREE.BoxGeometry(x1 - x0 + 0.1, 1, y1 - y0 + 0.1);
  const box = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffa42b, transparent: true, opacity: 0.38, depthWrite: false }));
  box.renderOrder = 10;
  box.visible = false;
  const edges = new LineSegments2(new LineSegmentsGeometry().fromEdgesGeometry(new THREE.EdgesGeometry(g)), OUTLINE.floor);
  edges.renderOrder = 11;
  box.add(edges);
  box.userData.centre = c;
  scene.add(box);
  return box;
})();
function showFloorBox(f) {
  const fl = f && HOUSE.floors.find((q) => q.floor === f);
  floorBox.visible = !!fl && !aptsOnFloor(HOUSE.key, f).length;
  if (!fl) return;
  floorBox.position.set(floorBox.userData.centre.x, fl.z - 0.35 + fl.h / 2, floorBox.userData.centre.z);
  floorBox.scale.set(1, fl.h, 1);
}
// What is under the pointer: { apt } (a flat of the open floor), { floor } (a floor seen from outside), or null.
function pick(e) {
  if (!building) return null;
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  if (state.mode === 'floor') {
    const open = building.pickables.filter((o) => isOpen(o.userData.apt));
    const hit = ray.intersectObjects(open, false)[0];
    if (hit) return hit.object.userData;
  }
  const below = (o) => state.mode !== 'floor' || o.userData.floor < state.floor;
  const hit = ray.intersectObjects(floorPicks.filter(below), false)[0];
  return hit ? { floor: hit.object.userData.floor } : null;
}
let down = null;
canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
canvas.addEventListener('pointermove', (e) => {
  if (state.mode === 'walk' || e.pointerType === 'touch') return;
  if (e.buttons) {
    tooltip.style.opacity = 0;
    return;
  }
  const hit = pick(e);
  const a = hit?.apt ?? null;
  const floorHover = hit?.floor ? { tower: HOUSE.key, floor: hit.floor } : null;
  const changed = JSON.stringify(floorHover) !== JSON.stringify(state.hoverFloor);
  state.hoverFloor = floorHover;
  if (changed) {
    renderFloors();
    updateOverlays();
  }
  setHover(a);
  canvas.style.cursor = hit ? 'pointer' : '';
  const T = L();
  if (hit?.floor) {
    const list = aptsOnFloor(HOUSE.key, hit.floor);
    const n = filterActive() ? list.filter(matches).length : list.length;
    const free = hasStatuses() && list.length ? ` · ${T.freeN(list.filter(isFree).length)}` : '';
    tooltip.innerHTML = T.tipFloor(hit.floor, list.length ? `${T.flats(n)}${free}` : T.noPlans);
    tooltip.style.left = `${e.clientX + 16}px`;
    tooltip.style.top = `${e.clientY + 12}px`;
    tooltip.style.opacity = 1;
  } else tooltip.style.opacity = 0;
});
canvas.addEventListener('pointerleave', () => {
  tooltip.style.opacity = 0;
  if (state.mode !== 'walk') {
    setHover(null);
    state.hoverFloor = null;
    updateOverlays();
  }
});
canvas.addEventListener('pointerup', (e) => {
  if (state.mode === 'walk' || !down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6;
  down = null;
  if (moved) return;
  const hit = pick(e);
  if (!hit) return;
  tooltip.style.opacity = 0;
  if (hit.apt) selectApt(hit.apt);
  else if (hit.floor) selectFloor(HOUSE.key, hit.floor);
});

// The side panels cover the edges of a wide screen: the camera's centre moves into the free space
// between them, so what it looks at (a block, the open floor) shows in the middle of what is seen
// and the tags at its ends stay clear of the panels.
function frameCentre() {
  const W = innerWidth, H = innerHeight;
  let dx = 0;
  if (state.mode !== 'walk' && W > 760) {
    const l = $('#floors').getBoundingClientRect().right, r = $('#side').getBoundingClientRect().left;
    if (r - l > 240) dx = Math.round(W / 2 - (l + r) / 2);
  }
  if (dx) camera.setViewOffset(W, H, dx, 0, W, H);
  else camera.clearViewOffset();
}

// ---------- loop ----------
addEventListener('resize', () => {
  if (!$('#plan-big').hidden && state.apt) openPlan(state.apt);
  camera.aspect = innerWidth / innerHeight;
  frameCentre();
  camera.updateProjectionMatrix();
  pipeline.setSize(innerWidth, innerHeight);
});

// The sun follows the view, as on the client's renders: it lights the facade the camera faces most
// squarely, from 22 degrees round on the far side from the other visible face; when the view turns
// past a corner it swings round to the next facade in about a second.
let sunAz = null;
// The camera stays out of the house and above the ground: zooming in on a corner, panning or a low
// orbit would take it through the walls into the hollow floors. (With a floor open, the house above
// it is hidden: only up to the open floor's walls.)
const HOUSE_BOX = (() => {
  const xs = HOUSE.outline.map((p) => p[0]), ys = HOUSE.outline.map((p) => p[1]);
  const a = toScene(Math.min(...xs), Math.min(...ys)), b = toScene(Math.max(...xs), Math.max(...ys));
  const m = 1.2;
  return { x0: Math.min(a.x, b.x) - m, x1: Math.max(a.x, b.x) + m, z0: Math.min(a.z, b.z) - m, z1: Math.max(a.z, b.z) + m };
})();
function keepOutside() {
  const c = camera.position;
  if (c.y < 1.8) c.y = 1.8;
  const top = state.mode === 'floor' ? (HOUSE.floors.find((f) => f.floor === state.floor)?.z ?? 0) + 4 : HOUSE.top + 1;
  const B = HOUSE_BOX;
  if (c.x <= B.x0 || c.x >= B.x1 || c.z <= B.z0 || c.z >= B.z1 || c.y >= top) return;
  // out by the nearest face
  const d = [[c.x - B.x0, 'x0'], [B.x1 - c.x, 'x1'], [c.z - B.z0, 'z0'], [B.z1 - c.z, 'z1'], [top - c.y, 'top']].sort((p, q) => p[0] - q[0])[0][1];
  if (d === 'x0') c.x = B.x0;
  else if (d === 'x1') c.x = B.x1;
  else if (d === 'z0') c.z = B.z0;
  else if (d === 'z1') c.z = B.z1;
  else c.y = top;
}

function followSun(dt) {
  const dx = camera.position.x - controls.target.x, dy = -(camera.position.z - controls.target.z);
  if (Math.hypot(dx, dy) < 1) return;
  const A = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
  const phi = A % 90;
  const goal = phi < 45 ? A - phi - 22 : A - phi + 90 + 22;
  if (sunAz === null) {
    sunAz = goal;
  } else {
    const d = ((goal - sunAz + 540) % 360) - 180;
    if (Math.abs(d) < 0.02) return;
    sunAz += d * Math.min(1, dt * 3.0);
    if (Math.abs(d) < 0.3) sunAz = goal;
  }
  if (daytime) daytime.follow(sunAz);
  else world.aimSun(sunAz);
  shadowsDirty();
}

const clock = new THREE.Clock();
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
renderer.info.autoReset = false;
renderer.setAnimationLoop(() => {
  renderer.info.reset();
  const dt = Math.min(clock.getDelta(), 0.05);
  if (tween) {
    tween.t += dt;
    const k = ease(Math.min(1, tween.t / tween.dur));
    camera.position.lerpVectors(tween.p0, tween.p1, k);
    controls.target.lerpVectors(tween.t0, tween.t1, k);
    if (k >= 1) {
      tween = null;
      controls.enabled = true;
    }
  }
  if (state.mode === 'walk') {
    walk.update(dt);
    drawMinimap();
  } else {
    controls.autoRotate = state.mode === 'overview' && performance.now() - lastInteraction > 25000;
    if (!tween) {
      controls.update();
      keepOutside();
    } else camera.lookAt(controls.target);
    if (building) updateLabels();
  }
  for (const n of water) n.offset.x += dt * 0.006, n.offset.y += dt * 0.004;
  // the rooms' own light at night: an open floor seen from outside, or the flat walked through
  ROOM_LIGHT.value = !daytime ? 0 : daytime.state.lights * (state.mode === 'walk' ? 0.38 : 0.55);
  if (state.mode !== 'walk') followSun(dt);
  updateCars(camera);
  if (shadowFrames > 0) {
    renderer.shadowMap.needsUpdate = true;
    shadowFrames--;
  }
  pipeline.render(dt);
  watchFrames();
});

// High graphics on a slower computer (a Retina laptop renders four times the pixels at twice the
// pixel ratio, 4x multisampled, with ambient occlusion): once the model is in and the shaders are
// compiled, the frame times are watched over 3-second stretches of a visible page; while they are
// slow (under ~28 fps) the pixel ratio steps down to 1. Still slow at 1: the light level is offered.
let watch = null;
function watchFrames() {
  if (Q.level !== 'high' || !building || document.hidden) {
    watch = null;
    return;
  }
  const now = performance.now();
  if (!watch) {
    watch = { t0: now + 4000, n: 0, offered: watch?.offered };
    return;
  }
  if (now < watch.t0) return;
  watch.n++;
  if (now - watch.t0 < 3000) return;
  const fps = (watch.n * 1000) / (now - watch.t0);
  watch.t0 = now;
  watch.n = 0;
  if (fps >= 28) return;
  const pr = renderer.getPixelRatio();
  if (pr > 1.01) {
    renderer.setPixelRatio(Math.max(1, pr - 0.5));
    pipeline.setSize(innerWidth, innerHeight);
    shadowsDirty();
  } else if (!watch.offered) {
    watch.offered = true;
    toast(L().slowHint, 7000);
  }
}

refresh();
frameCentre();
camera.updateProjectionMatrix();
watchSales(() => {
  buildLabels();
  refresh();
});
const STILL = new URLSearchParams(location.search).has('still');
lastInteraction = STILL ? Infinity : performance.now();

// handles for the automated checks in tools/ (screenshots, picking and walk tests)
window.__app = {
  THREE, scene, camera, controls, renderer, state, walk, apartments, pipeline, world, quality: Q,
  get building() { return building; },
  get interior() { return walkInterior; },
  get daytime() { return daytime; },
  selectFloor, selectApt, enterWalk, exitWalk, goOverview, setHours,
  setView(pos, target) {
    tween = null;
    camera.position.set(...pos);
    controls.target.set(...target);
    controls.update();
  },
};
