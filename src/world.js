// Sky, sun, mountains, trees, cars and people. Ground, roads and buildings come with the model.
//
// Light: the sky is an HDRI (Poly Haven, CC0) that lights the scene through the environment map
// and is the background; its sun disc was taken out (scripts/build_web_assets.py) and replaced by
// a directional light from the same direction, so the sun casts shadows and is counted once.
// Dushanbe lies in a valley: the Hissar range rises to the north, lower ridges close it in the
// south; they are drawn here as a ring of hazy ridges far beyond the city.
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { CARS, PALMS, PEOPLE, TREES, toScene } from './config.js';
import { addCars, addPalms, addPeople, addTrees } from './props.js';
import { houseSet } from './houseTextures.js';
import { Q } from './quality.js';
import { cheapShadow, sunPenumbraScale } from './shadows.js';
import skyInfo from '../public/env/sky.json';

const ENV = `${import.meta.env.BASE_URL}env/`;
// daylight like the marketing renders: a warm afternoon sun, the sky's light softer (it is blue: too
// much of it turns the brick and the white stone cold); ?sun= ?sky= ?suncolor= to compare
const LIGHT = new URLSearchParams(location.search);
const SKY_INTENSITY = +(LIGHT.get('sky') ?? 2.2);
const SUN_INTENSITY = +(LIGHT.get('sun') ?? 3.4);
const SUN_COLOR = LIGHT.get('suncolor') ? `#${LIGHT.get('suncolor')}` : '#fff3e2';
const HAZE = new THREE.Color(0xcad6e0);

function rng(seed) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

/** Round the block (renders 1-8): a park of dense trees out to ~260 m, then the city - clusters of
 * pale high-rise towers (16-32 floors, white render and blue-grey glass) - out to 1.3 km. The streets
 * round the block run on straight out to the city. Returns the park's trees. */
// plan metres (x east, y north); scene z = -y
const BLOCK = { x0: -82, x1: 82, y0: -25.3, y1: 74 };
// the main street, a boulevard (blender/hoji/site.py): near roadway, green, far roadway, far sidewalk
const MAIN = { near: -41.3, green: -60, far: -74, walk: -77.6 };
const onBlock = (x, y) => x > BLOCK.x0 - 2 && x < BLOCK.x1 + 2 && y > BLOCK.y0 - 2 && y < BLOCK.y1 + 2;
const onRoad = (x, y) =>
  (y > MAIN.walk - 3 && y < BLOCK.y0 + 1) || (y > BLOCK.y1 - 1 && y < BLOCK.y1 + 10 + 6.5) ||
  (x > BLOCK.x0 - 10 - 6.5 && x < BLOCK.x0 + 1) || (x > BLOCK.x1 - 1 && x < BLOCK.x1 + 10 + 6.5);

// the lines along which renders 5 and 8 look at the house stay open (blender/hoji/site.py VIEWPOINTS)
const VIEWPOINTS = [[-73.7, -97.5], [65.6, -98.4]];
function inView(x, y, width = 17) {
  for (const [cx, cy] of VIEWPOINTS) {
    if (y > -40 || y < cy - 8) continue;
    const L2 = cx * cx + cy * cy;
    const t = Math.max(0, Math.min(1, ((x - cx) * -cx + (y - cy) * -cy) / L2));
    if (Math.hypot(x - (cx - t * cx), y - (cy - t * cy)) < width) return true;
  }
  return false;
}

function city(scene) {
  const rnd = rng(31);
  const boxes = [], trees = [];
  // the park: clumps of trees out to ~480 m, denser near the block (where the renders show a wall of
  // trees); fewer on the light graphics level
  const clumps = Q.level === 'high' ? 1500 : 650;
  for (let k = 0; k < clumps; k++) {
    const a = rnd() * Math.PI * 2, r = 95 + Math.pow(rnd(), 1.25) * 385;
    const cx = Math.cos(a) * r * 1.15, cy = 24 + Math.sin(a) * r;
    const n = 2 + Math.floor(rnd() * 5);
    for (let j = 0; j < n; j++) {
      const x = cx + (rnd() - 0.5) * 16, y = cy + (rnd() - 0.5) * 16;
      if (onBlock(x, y) || onRoad(x, y)) continue;
      // the view of the house from across the street stays open (renders 5 and 8)
      if (inView(x, y)) continue;
      trees.push({ x, z: -y, h: 7 + rnd() * 7 });
    }
  }
  // the towers, in groups of three to six like housing estates
  for (let k = 0; k < 70; k++) {
    const a = rnd() * Math.PI * 2, r = 560 + Math.pow(rnd(), 0.8) * 900;
    const gx = Math.cos(a) * r, gy = 24 + Math.sin(a) * r;
    const n = 3 + Math.floor(rnd() * 4);
    const turn = rnd() < 0.5 ? 0 : Math.PI / 2;
    for (let j = 0; j < n; j++) {
      const x = gx + (j % 3) * 46 + (rnd() - 0.5) * 8, y = gy + Math.floor(j / 3) * 52 + (rnd() - 0.5) * 8;
      if (onRoad(x, y)) continue;
      const floors = 20 + Math.floor(rnd() * 16);
      boxes.push({ x, z: -y, w: 20 + rnd() * 8, l: 17 + rnd() * 5, h: floors * 3.1, r: turn, tall: true });
    }
  }
  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const mat = cheapShadow(new THREE.MeshStandardMaterial({ name: 'City', color: 0xffffff, roughness: 0.95 }));
  const im = new THREE.InstancedMesh(geo, mat, boxes.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
  boxes.forEach((b, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.r);
    m4.compose(p.set(b.x, 0, b.z), q, s.set(b.w, b.h, b.l));
    im.setMatrixAt(i, m4);
    // white render and pale blue-grey glass, as the towers behind the trees on the renders
    const tones = [[0.58, 0.18, 0.86], [0.6, 0.12, 0.9], [0.1, 0.04, 0.92], [0.57, 0.22, 0.8]];
    const t = tones[Math.floor(rnd() * tones.length)];
    im.setColorAt(i, col.setHSL(t[0] + (rnd() - 0.5) * 0.02, t[1] * (0.8 + rnd() * 0.4), t[2] * (0.95 + rnd() * 0.05)));
  });
  im.castShadow = false;
  im.receiveShadow = true;
  im.name = 'city';
  scene.add(im);
  return { mat, trees };
}

// ---------- the sky ----------
// The renders' sky: a deep clear blue, paler towards the horizon, scattered fair-weather cumulus.
// Drawn per pixel on a sphere round the camera, so the clouds stay crisp at any zoom: the view ray
// meets a cloud layer 2 km up; the clouds are where a few octaves of noise on that layer pass a
// threshold, lit on the sun's side, a little blue-grey underneath. Below the horizon: the ground's
// dark green-grey (only the windows' reflections see it). Colours are the renders' (linear).
const SKY_GLSL_STOPS = [[-90, [38, 46, 34]], [-1, [70, 80, 64]], [0, [178, 210, 244]], [2, [150, 196, 242]], [5, [103, 169, 234]],
  [10, [54, 138, 227]], [15, [22, 117, 213]], [30, [12, 98, 203]], [90, [8, 82, 190]]];
// light: the sky's brightness, 0..1 (src/night.js dims it at dusk; the dome of the night sky covers it)
function makeSky(sunDir, trees = false, light = { value: 1 }) {
  const lin = (c) => ((c / 255 + 0.055) / 1.055) ** 2.4;
  const el = SKY_GLSL_STOPS.map((s) => s[0]);
  const col = SKY_GLSL_STOPS.map((s) => new THREE.Vector3(...s[1].map(lin)));
  const mat = new THREE.ShaderMaterial({
    name: 'Sky',
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    uniforms: {
      uEl: { value: el },
      uCol: { value: col },
      uSun: { value: sunDir.clone().normalize() },
      uCover: { value: +(LIGHT.get('clouds') ?? 0.68) },
      uTrees: { value: trees ? 1 : 0 },
      uLight: light,
      uGlow: { value: +(LIGHT.get('glow') ?? 1) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = (modelMatrix * vec4(position, 0.0)).xyz;
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uEl[${el.length}];
      uniform vec3 uCol[${el.length}];
      uniform vec3 uSun;
      uniform float uCover;
      uniform float uTrees;
      uniform float uLight;
      uniform float uGlow;
      varying vec3 vDir;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      float fbm(vec2 p) {
        float v = 0.0, a = 0.5;
        mat2 r = mat2(0.8, -0.6, 0.6, 0.8);
        for (int i = 0; i < 6; i++) { v += a * noise(p); p = r * p * 2.07 + 13.7; a *= 0.5; }
        return v;
      }
      float cumulus(vec2 q) {
        float c = fbm(q * 0.45);
        float b = 0.0, a = 0.5;
        vec2 r = q * 1.6;
        mat2 m = mat2(0.8, -0.6, 0.6, 0.8);
        for (int i = 0; i < 5; i++) { b += a * (1.0 - abs(2.0 * noise(r) - 1.0)); r = m * r * 2.13 + 7.3; a *= 0.5; }
        return c * 0.7 + b * 0.38;
      }
      vec3 gradient(float e) {
        vec3 c = uCol[0];
        for (int i = 1; i < ${el.length}; i++) {
          float k = clamp((e - uEl[i - 1]) / (uEl[i] - uEl[i - 1]), 0.0, 1.0);
          c = e > uEl[i - 1] ? mix(uCol[i - 1], uCol[i], k) : c;
        }
        return c;
      }
      void main() {
        vec3 d = normalize(vDir);
        float e = degrees(asin(clamp(d.y, -1.0, 1.0)));
        vec3 col = gradient(e);
        // the sun's glow: the haze scatters its light forward, so the sky brightens and warms
        // towards the sun, most of all along the horizon on its side (uGlow 0 turns it off)
        float toSun = max(dot(d, uSun), 0.0);
        vec3 glow = vec3(1.0, 0.93, 0.82) * (0.05 * pow(toSun, 5.0) + 0.3 * pow(toSun, 60.0)) * uGlow;
        glow += vec3(0.9, 0.86, 0.78) * 0.05 * pow(max(dot(normalize(vec3(d.x, 0.0, d.z) + 1e-5), normalize(vec3(uSun.x, 0.0, uSun.z) + 1e-5)), 0.0), 3.0) * exp(-max(d.y, 0.0) * 9.0) * uGlow;
        col += glow * uGlow;
        if (d.y > 0.004) {
          // fair-weather cumulus: clusters from a low-frequency field, puffy cells from ridged noise,
          // the side towards the sun bright, the bottoms and the far side a soft blue-grey
          vec2 p = d.xz / (d.y + 0.1) * 1.4;
          vec2 q = p * 1.05 + vec2(3.7, 1.9);
          float d0 = cumulus(q);
          float dens = smoothstep(uCover, uCover + 0.07, d0);
          vec2 toSun2 = normalize(uSun.xz + 1e-4) * 0.09;
          float dl = cumulus(q + toSun2);
          float lit = clamp(0.62 + (d0 - dl) * 5.0, 0.0, 1.0);
          float core = smoothstep(uCover + 0.04, uCover + 0.32, d0);
          vec3 cloud = mix(vec3(0.58, 0.64, 0.74), vec3(1.0, 1.0, 1.0), lit);
          cloud = mix(cloud, cloud * vec3(0.9, 0.92, 0.96), core * (1.0 - lit) * 0.6);
          // a cloud in front of the sun is lit through (thin at its edge)
          cloud += vec3(1.0, 0.95, 0.85) * pow(toSun, 20.0) * 0.25 * (1.0 - core) * uGlow;
          float fade = smoothstep(0.04, 0.2, d.y);
          col = mix(col, cloud, dens * fade);
        }
        if (uTrees > 0.5) {
          // (for the windows' reflections) the park's tree line round the horizon, its top ragged;
          // the lower floors' windows mirror it dark green, as on renders 5 and 8
          float az = atan(d.z, d.x);
          float top = 3.0 + 4.5 * fbm(vec2(az * 9.0, 1.7)) + 1.5 * noise(vec2(az * 40.0, 3.1));
          float tree = 1.0 - smoothstep(top - 0.6, top, e);
          vec3 leaf = mix(vec3(0.018, 0.032, 0.014), vec3(0.06, 0.09, 0.035), fbm(vec2(az * 60.0, e * 0.6)));
          col = mix(col, leaf, tree * step(-3.0, e));
        }
        gl_FragColor = vec4(col * uLight, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), mat);
  mesh.name = 'sky';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.onBeforeRender = (r, sc, cam) => {
    mesh.position.copy(cam.position);
    mesh.updateMatrixWorld();
  };
  return mesh;
}

/**
 * @param after  resolves when the model is in: sky, trees and cars wait for it
 */
export function buildWorld(scene, renderer, after = Promise.resolve()) {
  // The HDRI's sun stands in the east-south-east (azimuth 124 deg). The sky is turned so that the sun
  // comes from the south, a little west of it (195 deg), as on the client's renders: the shop front
  // in full sun, the ends in the shade, the cornices and window reveals casting short shadows
  const SKY_TURN = THREE.MathUtils.degToRad(-71);
  const sunDir = new THREE.Vector3(...skyInfo.sun_dir).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), SKY_TURN);
  scene.backgroundRotation.set(0, SKY_TURN, 0);
  scene.environmentRotation.set(0, SKY_TURN, 0);

  // aerial perspective: the city a kilometre out a little hazy, the complex (100-400 m) clear
  scene.fog = new THREE.FogExp2(HAZE.getHex(), +(LIGHT.get('fog') ?? 0.0011));
  const skyLight = { value: 1 };
  const skyMesh = makeSky(sunDir, false, skyLight);
  scene.background = null;
  scene.backgroundIntensity = SKY_INTENSITY;
  scene.environmentIntensity = SKY_INTENSITY;
  // The sky is drawn per pixel (its clouds stay crisp at any zoom). On phones that is a few dozen
  // noise reads for every sky pixel of every frame: there it is drawn once into a cube map and the
  // cube map is the background, redrawn only when the light changes (the hour, src/night.js).
  let skyChanged = () => {};
  if (Q.skyCube) {
    const rt = new THREE.WebGLCubeRenderTarget(512, { type: THREE.HalfFloatType, generateMipmaps: false });
    const cam = new THREE.CubeCamera(0.1, 2000, rt);
    const skyScene = new THREE.Scene();
    skyScene.add(skyMesh);
    skyChanged = () => {
      const tm = renderer.toneMapping;
      renderer.toneMapping = THREE.NoToneMapping;
      skyMesh.position.set(0, 0, 0);
      cam.update(renderer, skyScene);
      renderer.toneMapping = tm;
    };
    skyChanged();
    scene.background = rt.texture;
    scene.backgroundIntensity = 1; // (the drawn sky carries its own brightness)
    scene.backgroundRotation.set(0, 0, 0);
  } else {
    scene.add(skyMesh);
  }

  const sun = new THREE.DirectionalLight(new THREE.Color(SUN_COLOR), SUN_INTENSITY);
  sun.position.copy(sunDir).multiplyScalar(600);
  sun.castShadow = true;
  sun.shadow.mapSize.set(Q.shadowMap, Q.shadowMap);
  const sc = sun.shadow.camera;
  // the block (150 x 115 m) in the sun's shadow map: about 5 cm a texel on the high level
  sc.left = -105;
  sc.right = 105;
  sc.top = 105;
  sc.bottom = -105;
  sc.near = 450;
  sc.far = 760;
  sun.shadow.bias = -0.00004;
  sun.shadow.normalBias = 0.015;
  sun.shadow.radius = sunPenumbraScale(sun); // (src/shadows.js: the penumbra per depth, high level)
  scene.add(sun, sun.target);

  const fill = new THREE.HemisphereLight(0xd8e6f5, 0x8a8170, 1.2);
  scene.add(fill);
  // (no mountains: the renders show none, and a drawn ridge reads as fake at this distance)
  // the plain beyond the modelled ground (3 x 3 km) out to the haze, so the horizon is the fog's
  const plain = new THREE.Mesh(
    new THREE.RingGeometry(225, 16000, 96, 1).rotateX(-Math.PI / 2),
    cheapShadow(new THREE.MeshStandardMaterial({ color: 0x7d9e48, roughness: 1 })),
  );
  plain.position.y = -0.12;
  plain.receiveShadow = false;
  scene.add(plain);
  // the streets round the block run on from the edge of the modelled site (240 m) out to the city
  {
    const road = cheapShadow(new THREE.MeshStandardMaterial({ name: 'Far road', color: 0x55575a, roughness: 0.95 }));
    const walk = cheapShadow(new THREE.MeshStandardMaterial({ name: 'Far walk', color: 0xb9b2a8, roughness: 0.95 }));
    const median = cheapShadow(new THREE.MeshStandardMaterial({ name: 'Far median', color: 0x5f8a36, roughness: 1 }));
    const strip = (x0, y0, x1, y1, mat, h) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0)).rotateX(-Math.PI / 2), mat);
      m.position.set((x0 + x1) / 2, h, -(y0 + y1) / 2);
      m.receiveShadow = true;
      scene.add(m);
    };
    const F = 2600, E = 239.5;
    for (const [s0, s1] of [[-F, -E], [E, F]]) {
      strip(s0, MAIN.near, s1, BLOCK.y0, road, -0.02);   // the main street in front: roadway, green,
      strip(s0, MAIN.green, s1, MAIN.near, median, 0.05); // roadway, the far sidewalk
      strip(s0, MAIN.far, s1, MAIN.green, road, -0.02);
      strip(s0, MAIN.walk, s1, MAIN.far, walk, 0.1);
      strip(s0, 74, s1, 84, road, -0.02);            // the street behind
      strip(s0, 84, s1, 87.6, walk, 0.1);
      strip(-92, s0, -82, s1, road, -0.02);          // the side streets
      strip(-95.6, s0, -92, s1, walk, 0.1);
      strip(82, s0, 92, s1, road, -0.02);
      strip(92, s0, 95.6, s1, walk, 0.1);
    }
  }
  const { mat: cityMat, trees: cityTrees } = city(scene);
  // the street lights along those streets, out to the city: lit at night (src/night.js)
  const cityLights = [];
  for (let r = 250; r < 2600; r += 32) {
    for (const sgn of [-1, 1]) {
      const x = sgn * r;
      cityLights.push({ x, y: 8.6, z: -(MAIN.near - 2) }, { x: x + sgn * 16, y: 8.6, z: -(MAIN.green + 2) }, { x, y: 8.6, z: -85.5 });
      cityLights.push({ x: -93.5, y: 8.6, z: -x }, { x: 93.5, y: 8.6, z: -x });
    }
  }

  const pmrem = new THREE.PMREMGenerator(renderer);
  const hdr = new RGBELoader().setDataType(THREE.FloatType);
  const sky = (res) => hdr.loadAsync(`${ENV}sky_${res}.hdr`).then((t) => ((t.mapping = THREE.EquirectangularReflectionMapping), t));
  // the light of the sky on the buildings: the HDRI's blue partly taken out (the renders' white stone
  // is white in the sun and a cool light grey in the shade, not blue)
  const neutral = (t) => {
    const src = t.image.data, n = src.length / 4;
    const out = new Float32Array(src.length);
    const K = +(LIGHT.get('skysat') ?? 0.6);
    // below the horizon the HDRI mirrors its sky; the light from below is the ground's: lawns and
    // the pink paving in the sun, a warm green-beige (linear), darker straight down
    const W_ = t.image.width, H_ = t.image.height;
    const GROUND = [0.26, 0.25, 0.18];
    for (let i = 0; i < n; i++) {
      const r = src[i * 4], g = src[i * 4 + 1], b = src[i * 4 + 2];
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const row = Math.floor(i / W_);
      const el = 90 - ((row + 0.5) / H_) * 180;
      let o = [l + (r - l) * K, l + (g - l) * K, l + (b - l) * K];
      if (el < 1) {
        const k = THREE.MathUtils.clamp((1 - el) / 4, 0, 1);
        const dark = 1 - 0.35 * THREE.MathUtils.clamp(-el / 90, 0, 1);
        o = o.map((v, j) => v + (GROUND[j] * dark - v) * k);
      }
      out[i * 4] = o[0];
      out[i * 4 + 1] = o[1];
      out[i * 4 + 2] = o[2];
      out[i * 4 + 3] = 1;
    }
    const e = new THREE.DataTexture(out, t.image.width, t.image.height, THREE.RGBAFormat, THREE.FloatType);
    e.mapping = THREE.EquirectangularReflectionMapping;
    e.colorSpace = t.colorSpace;
    e.flipY = t.flipY;          // the HDR's rows run top-down (RGBELoader flips it on upload)
    e.needsUpdate = true;
    return e;
  };
  // the renders' sky by elevation (sampled from renders 1, 3, 5 and 8): the haze colour at the horizon
  const SKY_STOPS = [[-90, [150, 196, 242]], [0, [178, 210, 244]], [2, [150, 196, 242]], [5, [103, 169, 234]],
    [10, [54, 138, 227]], [15, [22, 117, 213]], [30, [12, 98, 203]], [90, [8, 82, 190]]];
  const lin = (c) => ((c / 255 + 0.055) / 1.055) ** 2.4;
  const skyAt = (el) => {
    let i = 1;
    while (i < SKY_STOPS.length - 1 && el > SKY_STOPS[i][0]) i++;
    const [e0, c0] = SKY_STOPS[i - 1], [e1, c1] = SKY_STOPS[i];
    const k = THREE.MathUtils.clamp((el - e0) / (e1 - e0), 0, 1);
    return [0, 1, 2].map((j) => lin(c0[j] + (c1[j] - c0[j]) * k));
  };
  const horizon = (t) => {
    const { data, width: w, height: h } = t.image;
    const rows = [Math.round(h * 0.5) - 3, Math.round(h * 0.5) - 1];   // just above the horizon
    const c = [0, 0, 0];
    let n = 0;
    for (const y of rows) {
      for (let x = 0; x < w; x += 4) {
        const i = (y * w + x) * 4;
        c[0] += data[i]; c[1] += data[i + 1]; c[2] += data[i + 2];
        n++;
      }
    }
    const k = SKY_INTENSITY / n;
    scene.fog.color.setRGB(c[0] * k, c[1] * k, c[2] * k);
  };
  const ready = after
    .then(() => sky(Q.skyRes))
    .then((t) => {
      horizon(t);
      scene.fog.color.setRGB(...skyAt(1.0)).multiplyScalar(0.97);
      const e = neutral(t);
      scene.environment = pmrem.fromEquirectangular(e).texture;
      e.dispose();
      // the glass reflects the sky as drawn (deep blue, white clouds, the dark ground below); the
      // walls and the ground are lit by the neutral version of the HDRI
      const skyScene = new THREE.Scene();
      skyScene.add(makeSky(sunDir, true));
      const cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
      const cubeCam = new THREE.CubeCamera(0.1, 2000, cubeRT);
      const tm = renderer.toneMapping;
      renderer.toneMapping = THREE.NoToneMapping;
      cubeCam.update(renderer, skyScene);
      renderer.toneMapping = tm;
      const skyEnv = pmrem.fromCubemap(cubeRT.texture).texture;
      scene.traverse((o) => {
        for (const m of [o.material].flat()) {
          if (m?.userData?.glass && !m.envMap) {
            m.envMap = skyEnv;
            m.needsUpdate = true;
          }
        }
      });
      // dark from now on, kept for the moonlit sky at night (src/night.js): the number of lights stays
      // the same, so no shader is rebuilt when the evening comes
      fill.intensity = 0;
      pmrem.dispose();
    })
    .catch((e) => console.warn('sky', e));

  addPeople(scene, PEOPLE, toScene);
  const props = after.then(() => {
    // the complex's trees, then the city's (site metres for both: scene z = -north)
    // mostly green, as on renders 2, 3, 7: now and then a conifer, a poplar, a tree in flower
    const kindOf = (i) => (i % 13 === 0 ? 'conifer' : i % 11 === 0 ? 'poplar' : i % 19 === 0 ? 'blossom' : i % 29 === 0 ? 'white' : 'broad');
    const around = cityTrees.map((t, i) => [t.x, -t.z, 0, t.h, t.h * 0.38, kindOf(i)]);
    addTrees(scene, TREES.protos, TREES.list, [...TREES.placed, ...around], toScene);
    // the top floor's terrace shrubs: their own meshes, hidden with the top floor (src/main.js)
    addTrees(scene, [], [], TREES.terrace, toScene, 'terrace');
    addCars(scene, CARS, toScene);
    addPalms(scene, PALMS, toScene, houseSet);
  });

  // The sun turned round the house (each client render lights the face the camera looks at most
  // squarely, from a little to its side): azimuth in degrees from north, clockwise; elevation in
  // radians, the afternoon's by default (src/night.js lowers it for other hours). The sun keeps its
  // distance from what it aims at (the house; indoors the flat, src/main.js lightInterior). The
  // sky's light turns with it, the visible sky does not.
  const ELEV = Math.asin(sunDir.y);
  const HDRI_AZ = THREE.MathUtils.radToDeg(Math.atan2(skyInfo.sun_dir[0], -skyInfo.sun_dir[2]));
  const aimSun = (az, el = ELEV) => {
    const a = THREE.MathUtils.degToRad(az);
    const d = sun.position.distanceTo(sun.target.position) || 600;
    sun.position.set(Math.sin(a) * Math.cos(el), Math.sin(el), -Math.cos(a) * Math.cos(el)).multiplyScalar(d).add(sun.target.position);
    sun.updateMatrixWorld();
    scene.environmentRotation.set(0, -THREE.MathUtils.degToRad(az - HDRI_AZ), 0);
  };
  return { sun, fill, cityMat, cityLights, aimSun, elevation: ELEV, skyLight, skyChanged, ready: Promise.all([ready, props]) };
}
