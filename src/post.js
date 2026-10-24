// The high level's frame passes, loaded only on that level (a separate chunk: phones never download it).
//   scene -> 4x MSAA, half-float -> ambient occlusion (N8AO) -> bloom, tone mapping, vignette -> screen
// Bloom is taken from the frame before tone mapping, where the sunlit white render and the lamps at
// night are brighter than white: it glows a little into its surroundings, the way a camera's lens
// does (the halo round white walls in the sun on any photograph). Faint, so that nothing looks
// washed; ?bloom=0 turns it off, ?bloom=0.6 doubles it. The vignette darkens the corners by a
// few percent, like a lens.
import * as THREE from 'three';
import { BloomEffect, EffectComposer, EffectPass, RenderPass, ToneMappingEffect, ToneMappingMode, VignetteEffect } from 'postprocessing';
import { N8AOPostPass } from 'n8ao';

const MODES = { agx: ToneMappingMode.AGX, neutral: ToneMappingMode.NEUTRAL, aces: ToneMappingMode.ACES_FILMIC };
const params = new URLSearchParams(location.search);
const BLOOM = +(params.get('bloom') ?? 0.3);
const VIGNETTE = +(params.get('vignette') ?? 0.32);

export function postPipeline(renderer, scene, camera, tone) {
  const composer = new EffectComposer(renderer, { multisampling: 4, frameBufferType: THREE.HalfFloatType });
  composer.addPass(new RenderPass(scene, camera));
  const ao = new N8AOPostPass(scene, camera, innerWidth, innerHeight);
  Object.assign(ao.configuration, {
    aoRadius: 2.2, // metres: under balconies, at the foot of walls, where planters meet paving
    distanceFalloff: 0.6,
    intensity: 2.2,
    aoSamples: 16,
    denoiseSamples: 8,
    denoiseRadius: 10,
    halfRes: true,
    depthAwareUpsampling: true,
    gammaCorrection: false,
    color: new THREE.Color(0x0b0d10),
  });
  composer.addPass(ao);
  const effects = [];
  if (BLOOM > 0) {
    // (linear light before tone mapping: the sky is about 1, white render in the sun 3 and more)
    effects.push(new BloomEffect({ mipmapBlur: true, luminanceThreshold: 1.6, luminanceSmoothing: 0.5, intensity: BLOOM, radius: 0.72 }));
  }
  effects.push(new ToneMappingEffect({ mode: MODES[tone] }));
  if (VIGNETTE > 0) effects.push(new VignetteEffect({ offset: 0.28, darkness: VIGNETTE }));
  composer.addPass(new EffectPass(camera, ...effects));
  composer.setSize(innerWidth, innerHeight);
  return {
    render: (dt) => composer.render(dt),
    setSize: (w, h) => {
      renderer.setSize(w, h);
      composer.setSize(w, h);
    },
    // inside a flat: smaller radius, rooms are a few metres across
    walk: (on) => {
      ao.configuration.aoRadius = on ? 0.6 : 2.2;
      ao.configuration.distanceFalloff = on ? 0.35 : 0.6;
      ao.configuration.intensity = on ? 2.4 : 2.2;
    },
    ao,
  };
}
