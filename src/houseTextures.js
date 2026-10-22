// Canvas textures of the house and its grounds (renders 1-8), drawn once per page and seeded so
// every visit looks the same:
//   marble    the podium's cladding: golden-brown stone with cream veins, in large slabs
//   girih     the white ornamental panels between the windows (one star ornament per panel)
//   lattice   the dark metal screens in the narrow strips (cut-out ornament, one cell per width)
//   latticeDense  the lighter, denser screens of the back's and the ends' strips
//   pavers    the forecourt and paths: small pink and cream pavers in a diagonal pattern
//   frond     a palm frond (cut-out leaflets along the rib)
//   bark      a palm trunk's leaf scars
// Each returns { map, normal?, rough?, alpha?, metres } (metres: size of one tile; 0 = mapped once).
import * as THREE from 'three';
import { Q } from './quality.js';

const BIG = Q.level === 'high' ? 1024 : 512;
const cache = new Map();

function seeded(seed) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}
function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
function tex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

// tileable value noise on a period-p lattice
function noise2(seed, p) {
  const r = seeded(seed);
  const v = new Float32Array(p * p).map(() => r());
  const at = (i, j) => v[((j % p) + p) % p * p + (((i % p) + p) % p)];
  return (x, y) => {
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    const u = fx * fx * (3 - 2 * fx), w = fy * fy * (3 - 2 * fy);
    return (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - w) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * w;
  };
}

/** normal map (tangent space, OpenGL convention) from a height field (Float32Array w*h, 0..1) */
function normalsFrom(hgt, w, h, strength) {
  const c = canvas(w, h), g = c.getContext('2d'), img = g.createImageData(w, h);
  const H = (x, y) => hgt[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      img.data[i] = (-dx / l * 0.5 + 0.5) * 255;
      img.data[i + 1] = (dy / l * 0.5 + 0.5) * 255;   // canvas y runs down, texture v up
      img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return tex(c, false);
}

/** the height field of what is drawn on a canvas (its red channel, 0..1) */
function heightOf(c) {
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  const out = new Float32Array(c.width * c.height);
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4] / 255;
  return out;
}

// ---------- marble ----------
// The podium's stone (renders 1, 2, 3, 7, 8): an Emperador-like marble - golden olive-brown with
// cloudy darker patches and a dense web of thin cream veins (the crackle of the stone): the veins are
// the edges of a domain-warped Voronoi pattern at two scales, the bigger ones brighter. Slabs 1.2 x
// 0.8 m with fine joints; 2.4 m a tile (the pattern wraps).
function marble(dark) {
  const S = BIG, c = canvas(S), g = c.getContext('2d');
  const img = g.createImageData(S, S);
  const rnd = seeded(dark ? 71 : 37);
  const n1 = noise2(dark ? 5 : 3, 4), n2 = noise2(dark ? 9 : 7, 9), n3 = noise2(11, 23), n4 = noise2(17, 31);
  // Voronoi cells on a wrapping grid: one random point per cell
  const grid = (n) => {
    const pts = new Float32Array(n * n * 2);
    for (let i = 0; i < n * n; i++) {
      pts[i * 2] = rnd();
      pts[i * 2 + 1] = rnd();
    }
    return { n, pts };
  };
  const big = grid(4), small = grid(9);
  // distance to the nearest cell edge (F2 - F1) at (u, v) in [0, 1), wrapping
  const edge = ({ n, pts }, u, v) => {
    const x = u * n, y = v * n, ix = Math.floor(x), iy = Math.floor(y);
    let d1 = 9, d2 = 9;
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const cx = ix + i, cy = iy + j;
        const k = (((cy % n) + n) % n) * n + (((cx % n) + n) % n);
        const px = cx + pts[k * 2], py = cy + pts[k * 2 + 1];
        const d = Math.hypot(px - x, py - y);
        if (d < d1) {
          d2 = d1;
          d1 = d;
        } else if (d < d2) d2 = d;
      }
    }
    return (d2 - d1) / n;      // in texture units
  };
  // (renders 1, 2, 7: a warm golden brown, the darker patches olive-brown)
  const base = dark ? [[74, 62, 46], [102, 86, 64], [130, 112, 86]] : [[118, 92, 56], [158, 124, 78], [196, 164, 112]];
  const vein = dark ? [204, 196, 180] : [244, 238, 224];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      // cloudy tones
      const cl = 0.55 * n1(u * 4, v * 4) + 0.3 * n2(u * 9, v * 9) + 0.15 * n3(u * 23, v * 23);
      const k = Math.min(1, Math.max(0, cl * 1.6 - 0.3));
      const lo = k < 0.5 ? base[0] : base[1], hi = k < 0.5 ? base[1] : base[2], kk = k < 0.5 ? k * 2 : (k - 0.5) * 2;
      let col = [0, 1, 2].map((j) => lo[j] + (hi[j] - lo[j]) * kk);
      // warped coordinates for the crackle (wavy veins)
      const wu = u + 0.07 * (n1(u * 4 + 2.1, v * 4 + 6.3) - 0.5) + 0.04 * (n2(u * 9 + 4.3, v * 9 + 1.1) - 0.5) + 0.015 * (n4(u * 31, v * 31) - 0.5);
      const wv = v + 0.07 * (n1(u * 4 + 8.4, v * 4 + 0.7) - 0.5) + 0.04 * (n2(u * 9 + 7.7, v * 9 + 3.9) - 0.5) + 0.015 * (n4(u * 31 + 5, v * 31 + 2) - 0.5);
      const e1 = edge(big, ((wu % 1) + 1) % 1, ((wv % 1) + 1) % 1);
      const e2 = edge(small, ((wu * 1.0 + 0.37) % 1 + 1) % 1, ((wv + 0.61) % 1 + 1) % 1);
      const px = 1 / S;
      // veins fade in and out along their length (some cells stay open), the fine ones more so
      const f1 = THREE.MathUtils.smoothstep(n3(u * 23 + 9, v * 23), 0.25, 0.6);
      const f2 = THREE.MathUtils.smoothstep(n4(u * 31 + 3, v * 31 + 7), 0.35, 0.7);
      const w1 = Math.max(0, 1 - e1 / (5.0 * px)) * (0.55 + 0.45 * f1);
      const w2 = Math.max(0, 1 - e2 / (2.4 * px)) * 0.8 * f2;
      // a soft milky haze round the big veins
      const glow = Math.max(0, 1 - e1 / (10 * px)) * 0.2 * f1;
      // two or three bold wandering veins across the slab (renders 2, 8: white rivers in the stone)
      const r1 = Math.sin((wu * 1.0 + wv * 2.0 + 0.6 * n1(u * 4 + 1.3, v * 4 + 2.9)) * Math.PI * 2);
      const r2 = Math.sin((wu * -2.0 + wv * 1.0 + 0.7 * n1(u * 4 + 5.1, v * 4 + 0.4) + 0.35) * Math.PI * 2);
      const r3 = Math.sin((wu * 3.0 - wv * 1.0 + 0.8 * n2(u * 9 + 2.2, v * 9 + 6.6) + 0.7) * Math.PI * 2);
      const bold = Math.pow(1 - Math.abs(r1), 34) + Math.pow(1 - Math.abs(r2), 50) * 0.85 + Math.pow(1 - Math.abs(r3), 70) * 0.7;
      const halo = Math.pow(1 - Math.abs(r1), 8) * 0.25 + Math.pow(1 - Math.abs(r2), 10) * 0.15;
      const wv_ = Math.min(1, w1 + w2 + glow + bold + halo);
      col = col.map((cj, j) => cj + (vein[j] - cj) * wv_);
      const i = (y * S + x) * 4;
      img.data[i] = col[0];
      img.data[i + 1] = col[1];
      img.data[i + 2] = col[2];
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // slab joints
  g.fillStyle = 'rgba(52, 40, 26, 0.5)';
  const jw = Math.max(1, S / 600);
  for (let i = 0; i < 2; i++) g.fillRect(i * S / 2, 0, jw, S);
  for (let j = 0; j < 3; j++) g.fillRect(0, j * S / 3, S, jw);
  const hc = canvas(S), hg = hc.getContext('2d');
  hg.fillStyle = '#fff';
  hg.fillRect(0, 0, S, S);
  hg.fillStyle = '#000';
  for (let i = 0; i < 2; i++) hg.fillRect(i * S / 2 - jw, 0, jw * 3, S);
  for (let j = 0; j < 3; j++) hg.fillRect(0, j * S / 3 - jw, S, jw * 3);
  return { map: tex(c), normal: normalsFrom(heightOf(hc), S, S, 2.0), metres: 3.0 };
}

// ---------- the ornamental panels ----------
// Renders 5 and 8: grey stone panels with a dense lattice - a grid of small eight-pointed stars joined
// by diagonals (diamonds between them), cut a few millimetres deep; the panel's field mapped once
// (UV 0..1). Height map: the ribs high, the cut-outs low.
function girih() {
  const S = 512, c = canvas(S), g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, S, S);
  g.strokeStyle = '#fff';
  g.fillStyle = '#fff';
  g.lineCap = 'round';
  const n = 7, cell = S / n;
  // diagonals through the cell corners: a diamond trellis
  g.lineWidth = S / 120;
  for (let k = -n; k <= 2 * n; k++) {
    g.beginPath();
    g.moveTo(k * cell, 0);
    g.lineTo(k * cell + S, S);
    g.stroke();
    g.beginPath();
    g.moveTo(k * cell, 0);
    g.lineTo(k * cell - S, S);
    g.stroke();
  }
  // a small star in every cell and a dot at every crossing
  const star = (cx, cy, r) => {
    g.beginPath();
    for (let k = 0; k < 16; k++) {
      const a = (k * Math.PI) / 8;
      const rr = k % 2 ? r * 0.45 : r;
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      k ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath();
    g.fill();
  };
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      star((i + 0.5) * cell, (j + 0.5) * cell, cell * 0.26);
      g.beginPath();
      g.arc(i * cell, j * cell, cell * 0.07, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.filter = 'blur(1.5px)';
  g.drawImage(c, 0, 0);
  g.filter = 'none';
  const hgt = heightOf(c);
  // colour: the ribs light, the cut-outs in their shade a mid grey
  const cc = canvas(S), cg = cc.getContext('2d'), img = cg.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    const v = 0.8 + 0.2 * hgt[i];
    img.data[i * 4] = 240 * v;
    img.data[i * 4 + 1] = 241 * v;
    img.data[i * 4 + 2] = 242 * v;
    img.data[i * 4 + 3] = 255;
  }
  cg.putImageData(img, 0, 0);
  return { map: tex(cc), normal: normalsFrom(hgt, S, S, 4.0), metres: 0 };
}

// ---------- the ornamental metal screens ----------
// Renders 1, 5, 8: a laser-cut metal screen in the narrow strips - a vine scroll climbing the strip:
// a wavy stem, a spiral tendril and leaves on each bend, light metal on the dark slot behind. One
// cell is as tall as the strip is wide (the strip's UV: u across, v in widths up the strip). The
// alpha map is the metal (white) and the openings (black).
function lattice() {
  const S = 256, a = canvas(S), g = a.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, S, S);
  g.strokeStyle = '#fff';
  g.fillStyle = '#fff';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const stem = (y) => S / 2 + S * 0.2 * Math.sin((2 * Math.PI * y) / S);
  for (const oy of [-S, 0, S]) {
    // the stem
    g.lineWidth = S * 0.085;
    g.beginPath();
    for (let y = -4; y <= S + 4; y += 4) {
      const x = stem(y);
      y === -4 ? g.moveTo(x, y + oy) : g.lineTo(x, y + oy);
    }
    g.stroke();
    // on each bend a tendril curling out to the other side, ending in a spiral, and two leaves
    for (const [y0, side] of [[S * 0.25, -1], [S * 0.75, 1]]) {
      const x0 = stem(y0);
      g.lineWidth = S * 0.06;
      g.beginPath();
      let px = x0, py = y0 + oy;
      g.moveTo(px, py);
      const cx = S / 2 + side * S * 0.1, cy = y0 + oy - S * 0.05;
      for (let t = 0; t <= 1.0001; t += 0.04) {
        const ang = Math.PI * (side > 0 ? 1 : 0) + side * t * Math.PI * 2.4;
        const r = S * 0.2 * (1 - t * 0.85);
        px = cx + Math.cos(ang) * r * -side;
        py = cy + Math.sin(ang) * r * 0.9;
        g.lineTo(px, py);
      }
      g.stroke();
      g.beginPath();
      g.arc(px, py, S * 0.025, 0, Math.PI * 2);
      g.fill();
      // leaves: pointed ovals off the stem
      for (const [dy, dir] of [[-S * 0.13, side], [S * 0.12, -side]]) {
        const lx = stem(y0 + dy), ly = y0 + dy + oy;
        g.save();
        g.translate(lx, ly);
        g.rotate(dir * 0.9 + (dy < 0 ? -0.3 : 0.3));
        g.beginPath();
        g.moveTo(0, 0);
        g.quadraticCurveTo(dir * S * 0.09, -S * 0.07, dir * S * 0.2, 0);
        g.quadraticCurveTo(dir * S * 0.09, S * 0.07, 0, 0);
        g.fill();
        g.restore();
      }
    }
  }
  // the screen's border
  g.fillRect(0, 0, S * 0.06, S);
  g.fillRect(S * 0.94, 0, S * 0.06, S);
  // colour: light silver-grey metal
  const m = canvas(S), mg = m.getContext('2d');
  mg.fillStyle = '#c9ccce';
  mg.fillRect(0, 0, S, S);
  mg.globalAlpha = 0.3;
  mg.globalCompositeOperation = 'multiply';
  mg.filter = 'blur(2px)';
  mg.drawImage(a, 0, 0);
  mg.filter = 'none';
  mg.globalCompositeOperation = 'source-over';
  mg.globalAlpha = 1;
  return { map: tex(m), alpha: tex(a, false), metres: 0 };
}

// Renders 3, 7 (the back's strips) and 1, 2, 8 (the ends'): a denser screen - light metal fretwork with
// small irregular openings (a floral pattern seen from afar), most of the strip metal. Same mapping
// as lattice().
function latticeDense() {
  const S = 256, a = canvas(S), g = a.getContext('2d'), img = g.createImageData(S, S);
  // small openings of a floral fret (noise), held in a diagonal trellis of metal (8 cells across)
  const n1 = noise2(71, 10), n2 = noise2(72, 20), P = 8;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S, w = y / S;
      const n = 0.6 * n1(u * 10, w * 10) + 0.4 * n2(u * 20, w * 20);
      const du = (u + w) * P, dv = (u - w) * P;
      const rib = Math.min(Math.abs(du - Math.round(du)), Math.abs(dv - Math.round(dv))) < 0.08;
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = n > 0.47 || rib ? 255 : 0;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  g.fillStyle = '#fff';
  g.fillRect(0, 0, S * 0.06, S);
  g.fillRect(S * 0.94, 0, S * 0.06, S);
  // colour: pale grey metal, a touch darker round the openings
  const m = canvas(S), mg = m.getContext('2d');
  mg.fillStyle = '#dcdedf';
  mg.fillRect(0, 0, S, S);
  mg.globalAlpha = 0.35;
  mg.globalCompositeOperation = 'multiply';
  mg.filter = 'blur(2px)';
  mg.drawImage(a, 0, 0);
  mg.filter = 'none';
  mg.globalCompositeOperation = 'source-over';
  mg.globalAlpha = 1;
  return { map: tex(m), alpha: tex(a, false), metres: 0 };
}

// ---------- pavers ----------
// small pavers (20 x 10 cm) in pink and cream, laid in a herringbone-like stagger with the colours in
// diagonal bands (renders 3, 7); 1.6 m a tile
function pavers() {
  const S = BIG, c = canvas(S), g = c.getContext('2d'), rnd = seeded(13);
  const h = canvas(S), hg = h.getContext('2d');
  g.fillStyle = '#9c8478';
  g.fillRect(0, 0, S, S);
  hg.fillStyle = '#000';
  hg.fillRect(0, 0, S, S);
  const n = 16, cw = S / n, ch = S / (n * 2);
  const pink = ['#c49d90', '#bd9486', '#caa597', '#b98e80'], cream = ['#e2d5c6', '#dccdbc', '#e7dccf', '#d6c6b4'];
  for (let j = 0; j < n * 2; j++) {
    const off = (j % 2) * cw * 0.5;
    for (let i = -1; i <= n; i++) {
      const x = i * cw + off, y = j * ch;
      const band = Math.floor((i + j * 0.5) / 2) % 2 === 0;
      const set = band ? pink : cream;
      g.fillStyle = set[Math.floor(rnd() * set.length)];
      g.fillRect(x + 1.5, y + 1.5, cw - 3, ch - 3);
      g.globalAlpha = 0.18;
      g.fillStyle = rnd() < 0.5 ? '#fff' : '#7a5a50';
      g.fillRect(x + 2 + rnd() * cw * 0.5, y + 2, cw * 0.3, ch - 4);
      g.globalAlpha = 1;
      hg.fillStyle = '#fff';
      hg.fillRect(x + 1.5, y + 1.5, cw - 3, ch - 3);
    }
  }
  hg.filter = 'blur(1px)';
  hg.drawImage(h, 0, 0);
  return { map: tex(c), normal: normalsFrom(heightOf(h), S, S, 1.5), metres: 1.6 };
}

// ---------- palm ----------
// a frond: the rib up the middle, leaflets either side (alpha cut-out); u across, v along
function frond() {
  const W = 256, H = 1024, c = canvas(W, H), g = c.getContext('2d'), rnd = seeded(29);
  const a = canvas(W, H), ag = a.getContext('2d');
  g.fillStyle = '#4c6f2a';
  g.fillRect(0, 0, W, H);
  ag.fillStyle = '#000';
  ag.fillRect(0, 0, W, H);
  const mid = W / 2;
  for (let y = H * 0.06; y < H * 0.98; y += 9) {
    const t = y / H;
    const len = W * 0.48 * Math.sin(Math.PI * Math.min(1, t * 1.15)) * (0.85 + rnd() * 0.15);
    for (const s of [-1, 1]) {
      const ang = 0.55 + rnd() * 0.15;
      const x1 = mid + s * len * Math.cos(ang), y1 = y + len * Math.sin(ang) * 0.9;
      for (const [cg, col, lw] of [[ag, '#fff', 7], [g, `hsl(${88 + rnd() * 14}, ${38 + rnd() * 14}%, ${24 + rnd() * 14}%)`, 6]]) {
        cg.strokeStyle = col;
        cg.lineWidth = lw * (1 - t * 0.5);
        cg.lineCap = 'round';
        cg.beginPath();
        cg.moveTo(mid, y);
        cg.quadraticCurveTo(mid + s * len * 0.5, y + len * 0.2, x1, y1);
        cg.stroke();
      }
    }
  }
  for (const [cg, col] of [[ag, '#fff'], [g, '#8a8a4a']]) {
    cg.strokeStyle = col;
    cg.lineWidth = 6;
    cg.beginPath();
    cg.moveTo(mid, 0);
    cg.lineTo(mid, H);
    cg.stroke();
  }
  const map = tex(c), alpha = tex(a, false);
  map.wrapS = map.wrapT = alpha.wrapS = alpha.wrapT = THREE.ClampToEdgeWrapping;
  return { map, alpha, metres: 0 };
}

function bark() {
  const W = 256, H = 256, c = canvas(W, H), g = c.getContext('2d'), rnd = seeded(41);
  g.fillStyle = '#6d5a47';
  g.fillRect(0, 0, W, H);
  const h = canvas(W, H), hg = h.getContext('2d');
  hg.fillStyle = '#000';
  hg.fillRect(0, 0, W, H);
  // leaf scars: offset rows of rounded diamonds
  for (let j = 0; j < 8; j++) {
    for (let i = 0; i < 6; i++) {
      const x = (i + (j % 2) * 0.5) * (W / 6), y = j * (H / 8);
      for (const ox of [-W, 0, W]) {
        g.fillStyle = `hsl(28, ${18 + rnd() * 10}%, ${30 + rnd() * 14}%)`;
        g.beginPath();
        g.ellipse(x + ox, y + H / 16, W / 13, H / 20, 0, 0, Math.PI * 2);
        g.fill();
        hg.fillStyle = '#fff';
        hg.beginPath();
        hg.ellipse(x + ox, y + H / 16, W / 13, H / 20, 0, 0, Math.PI * 2);
        hg.fill();
      }
    }
  }
  hg.filter = 'blur(3px)';
  hg.drawImage(h, 0, 0);
  return { map: tex(c), normal: normalsFrom(heightOf(h), W, H, 3), metres: 0.5 };
}

const MAKERS = { marble: () => marble(false), marbleDark: () => marble(true), girih, lattice, latticeDense, pavers, frond, bark };

export function houseSet(kind) {
  if (!cache.has(kind)) cache.set(kind, MAKERS[kind]());
  return cache.get(kind);
}
