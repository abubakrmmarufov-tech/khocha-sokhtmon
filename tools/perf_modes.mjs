// Frame times of the site in its quality levels, after a warm-up: the overview while the camera
// orbits, a floor's cut-away, a walk-through. Prints fps and the 95th percentile frame time.
//   node tools/perf_modes.mjs [--url http://localhost:5191/] [--size 1920x1080]
import { chromium } from 'playwright-core';
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d);
const url = opt('url', 'http://localhost:5191/');
const [W, H] = opt('size', '1920x1080').split('x').map(Number);
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
for (const q of (opt('levels', 'low,high')).split(',')) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  await page.goto(`${url}?quality=${q}`);
  await page.waitForFunction(() => window.__app?.building, null, { timeout: 180000 });
  const gpu = await page.evaluate(() => { const gl = window.__app.renderer.getContext(); const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; });
  await page.waitForTimeout(6000);
  const measure = (label, setup) => page.evaluate(async ({ setup }) => {
    const app = window.__app;
    if (setup === 'floor') { app.selectFloor('A', 5); await new Promise((r) => setTimeout(r, 4000)); }
    if (setup === 'walk') { const a = app.apartments.find((x) => x.id === 'A5-1'); app.selectApt(a); app.enterWalk(a); for (let t = 0; t < 100 && !(app.interior && app.state.mode === 'walk'); t++) await new Promise((r) => setTimeout(r, 100)); await new Promise((r) => setTimeout(r, 3000)); }
    const times = [];
    let last = performance.now();
    const t0 = last;
    await new Promise((resolve) => {
      const step = (now) => {
        times.push(now - last);
        last = now;
        // keep the view moving: orbit the overview / floor, turn round in the walk
        if (setup === 'walk') { app.walk.yaw += 0.01; app.walk.apply(0); }
        else { const c = app.camera.position, t = app.controls.target; const a = 0.004, dx = c.x - t.x, dz = c.z - t.z; c.x = t.x + dx * Math.cos(a) - dz * Math.sin(a); c.z = t.z + dx * Math.sin(a) + dz * Math.cos(a); app.controls.update(); }
        if (now - t0 < 5000) requestAnimationFrame(step); else resolve();
      };
      requestAnimationFrame(step);
    });
    times.shift();
    const s = [...times].sort((a, b) => a - b);
    const p95 = s[Math.floor(s.length * 0.95)];
    return { fps: +(1000 / (times.reduce((a, b) => a + b, 0) / times.length)).toFixed(1), p95: +p95.toFixed(1), max: +s[s.length - 1].toFixed(1), frames: times.length };
  }, { setup });
  for (const v of ['overview', 'floor', 'walk']) console.log(q, v, JSON.stringify(await measure(v, v)), gpu);
  await page.close();
}
await browser.close();
