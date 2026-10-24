// Soft sun shadows (percentage-closer soft shadows) for the high graphics level.
//
// three.js's PCFSoft filter blurs every shadow edge by the same one and a half texels: the shadow of
// a cornice 30 m up and of a sill 20 cm above the wall come out equally crisp, which is what gives a
// rendering away. A real shadow's edge widens with the distance between what casts it and what
// receives it (the sun is half a degree across). This patch replaces the PCFSoft branch of the
// shadow chunk with that: a blocker search round the pixel in the shadow map, the penumbra from how
// far the blockers are in front of the receiver, and a Poisson-disc filter of that width. The disc
// is turned by a different angle at every pixel (interleaved gradient noise), so the few taps read
// as a fine grain instead of banding; the 4x multisampling of the high level smooths it further.
//
// Only the sun (a directional light) is filtered this way; the flats' point and spot lights keep
// three.js's filter. The light's `shadow.radius` is reused as the penumbra scale: the number of
// texels the penumbra widens per unit of normalized shadow-map depth (sunPenumbraScale below).
import * as THREE from 'three';

// Poisson disc, 16 samples in the unit circle
const POISSON = [
  [-0.94201624, -0.39906216], [0.94558609, -0.76890725], [-0.094184101, -0.92938870], [0.34495938, 0.29387760],
  [-0.91588581, 0.45771432], [-0.81544232, -0.87912464], [-0.38277543, 0.27676845], [0.97484398, 0.75648379],
  [0.44323325, -0.97511554], [0.53742981, -0.47373420], [-0.26496911, -0.41893023], [0.79197514, 0.19090188],
  [-0.24188840, 0.99706507], [-0.81409955, 0.91437590], [0.19984126, 0.78641367], [0.14383161, -0.14100790],
];
// the widest penumbra, in texels (the blocker search covers it): wider is softer but grainier
const MAX_PENUMBRA = 22.0;

const PCSS = /* glsl */ `
  vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
  // the slope of the receiver in the shadow map (receiver-plane depth bias): a tap off to the side of
  // the pixel is compared with the receiver's own depth there, so a wall or a lawn seen at a slant
  // does not shadow itself under a wide filter
  vec3 ddx = dFdx( shadowCoord.xyz ), ddy = dFdy( shadowCoord.xyz );
  float det = ddx.x * ddy.y - ddx.y * ddy.x;
  vec2 dzduv = abs( det ) > 1e-12
    ? vec2( ddy.y * ddx.z - ddx.y * ddy.z, ddx.x * ddy.z - ddy.x * ddx.z ) / det
    : vec2( 0.0 );
  dzduv = clamp( dzduv, vec2( -0.5 ), vec2( 0.5 ) );
  // the disc turned per pixel
  float ign = fract( 52.9829189 * fract( 0.06711056 * gl_FragCoord.x + 0.00583715 * gl_FragCoord.y ) );
  float ca = cos( ign * 6.2831853 ), sa = sin( ign * 6.2831853 );
  mat2 rot = mat2( ca, sa, -sa, ca );
  vec2 disc[ 16 ];
  ${POISSON.map(([x, y], i) => `disc[ ${i} ] = rot * vec2( ${x.toFixed(8)}, ${y.toFixed(8)} );`).join('\n  ')}
  // 1. blockers: the average depth of what lies in front of the receiver within the widest penumbra
  //    (12 taps: most pixels are fully lit or fully shadowed and stop here)
  float searchR = ${MAX_PENUMBRA.toFixed(1)};
  float blockers = 0.0, blockerSum = 0.0;
  for ( int i = 0; i < 12; i ++ ) {
    vec2 o = disc[ i ] * searchR * texelSize;
    float d = unpackRGBAToDepth( texture2D( shadowMap, shadowCoord.xy + o ) );
    float z = shadowCoord.z + dot( dzduv, o );
    if ( d < z ) { blockers += 1.0; blockerSum += d; }
  }
  if ( blockers < 0.5 ) {
    shadow = 1.0;
  } else if ( blockers > 11.5 ) {
    shadow = 0.0; // deep in the umbra: nothing to filter
  } else {
    // 2. the penumbra: wider the further the blockers are in front (shadowRadius texels per unit depth)
    float avg = blockerSum / blockers;
    float penumbra = clamp( ( shadowCoord.z - avg ) * shadowRadius, 1.0, ${MAX_PENUMBRA.toFixed(1)} );
    // 3. the filter over that width
    float lit = 0.0;
    for ( int i = 0; i < 16; i ++ ) {
      vec2 o = disc[ i ] * penumbra * texelSize;
      lit += step( shadowCoord.z + dot( dzduv, o ), unpackRGBAToDepth( texture2D( shadowMap, shadowCoord.xy + o ) ) );
    }
    shadow = lit / 16.0;
  }
`;

let installed = false;
/**
 * Patch the shadow chunk once (before any material compiles). A material with the define
 * CHEAP_SHADOW (cheapShadow below) keeps three.js's own filter: the tree cards, people and the
 * far city, where the few extra texels of penumbra are never seen but the overdraw is large.
 */
export function installSoftShadows() {
  if (installed) return;
  installed = true;
  const chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
  const marker = '#elif defined( SHADOWMAP_TYPE_PCF_SOFT )';
  const start = chunk.indexOf(marker);
  const end = chunk.indexOf('#elif defined( SHADOWMAP_TYPE_VSM )');
  if (start < 0 || end < 0) {
    console.warn('soft shadows: the shadow chunk has changed, keeping PCFSoft');
    return;
  }
  const pcfSoft = chunk.slice(start + marker.length, end);
  THREE.ShaderChunk.shadowmap_pars_fragment =
    `${chunk.slice(0, start)}${marker}\n#ifdef CHEAP_SHADOW\n${pcfSoft}\n#else\n${PCSS}\n#endif\n\t\t${chunk.slice(end)}`;
}

/** Mark a material to receive shadows with the plain filter (see installSoftShadows). */
export function cheapShadow(material) {
  material.defines = { ...(material.defines ?? {}), CHEAP_SHADOW: '' };
  return material;
}

/**
 * The sun's penumbra scale for its orthographic shadow camera: how many texels the penumbra widens
 * per unit of normalized depth. The sun's disc is half a degree across; a little more here, since
 * haze widens it and the renders' shadows are softer than a clear sky's.
 */
export function sunPenumbraScale(light, discDegrees = 1.4) {
  const c = light.shadow.camera;
  const width = c.right - c.left, depth = c.far - c.near;
  return Math.tan(THREE.MathUtils.degToRad(discDegrees)) * depth * (light.shadow.mapSize.x / width);
}
