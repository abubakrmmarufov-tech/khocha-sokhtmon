// Renderer and frame pipeline.
//   high: scene -> (4x MSAA, half-float) -> ambient occlusion (N8AO) -> tone mapping -> screen (src/post.js,
//         loaded on demand; until it is in, frames go straight to the screen)
//   low:  scene -> tone mapping -> screen, directly (no extra passes: phones, older laptops)
// Exposure and tone mapping are the same in both, so the two levels differ in detail, not in look.
import * as THREE from 'three';
import { Q } from './quality.js';

const params = new URLSearchParams(location.search);
export const EXPOSURE = +(params.get('exposure') ?? 1.0);
// tone mapping: Khronos PBR Neutral keeps the colours of the materials as they are (no extra
// saturation or contrast) and rolls off only the highlights; ?tonemap=agx|aces to compare
const TONE = ['neutral', 'agx', 'aces'].includes(params.get('tonemap')) ? params.get('tonemap') : 'neutral';
const THREE_TONE = { neutral: THREE.NeutralToneMapping, agx: THREE.AgXToneMapping, aces: THREE.ACESFilmicToneMapping };

export function createRenderer() {
  // an opaque canvas (three.js asks for one with an alpha channel): the leaves' alpha to coverage
  // leaves a pixel's alpha under 1 where a card's edge only partly covers it, and the page's light
  // background showed through the crowns as pale speckles (glaring at night)
  const canvas = document.createElement('canvas');
  const antialias = Q.level !== 'high'; // high renders into a multisampled target instead
  const context = window.WebGL2RenderingContext &&
    canvas.getContext('webgl2', { alpha: false, depth: true, stencil: false, antialias, premultipliedAlpha: true, powerPreference: 'high-performance' });
  if (!context) throw new Error('WebGL 2 is not available');
  const renderer = new THREE.WebGLRenderer({ canvas, context, antialias, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(Q.pixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE_TONE[TONE];
  renderer.toneMappingExposure = EXPOSURE;
  return renderer;
}

export function createPipeline(renderer, scene, camera) {
  const pipeline = {
    render: () => renderer.render(scene, camera),
    setSize: (w, h) => renderer.setSize(w, h),
    walk: () => {},
    ao: null,
    ready: Promise.resolve(),
  };
  if (Q.ao) {
    pipeline.ready = import('./post.js')
      .then(({ postPipeline }) => {
        Object.assign(pipeline, postPipeline(renderer, scene, camera, TONE));
        renderer.toneMapping = THREE.NoToneMapping; // done by the last pass now
      })
      .catch((e) => console.warn('post-processing unavailable, rendering directly', e));
  }
  return pipeline;
}
