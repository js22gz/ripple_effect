/**
 * copy.js — Vanilla JS "Export as Standalone HTML" for Rippler
 *
 * Path A implementation (exact engine source from live page).
 * Produces a true 1:1 duplicate of the current live visualization state
 * with no control UI.
 *
 * Requires: window.__RipplerEngine to be exposed by index.html
 */

(function () {
  'use strict';

  function collectLiveState() {
    const S = window.__rippler || {};

    const globals = {
      SHAPE_HEIGHT: S.SHAPE_HEIGHT ?? 520,
      BASE_WIDTH_TOP: S.BASE_WIDTH_TOP ?? 48,
      BASE_WIDTH_BOTTOM: S.BASE_WIDTH_BOTTOM ?? 48,
      CHAOS: S.CHAOS ?? 0,

      TOP_CAP_HEIGHT: S.TOP_CAP_HEIGHT ?? 25,
      TOP_CAP_FOCUS: S.TOP_CAP_FOCUS ?? 0,
      TOP_CAP_STRENGTH: S.TOP_CAP_STRENGTH ?? 1.0,

      BOTTOM_CAP_HEIGHT: S.BOTTOM_CAP_HEIGHT ?? 25,
      BOTTOM_CAP_FOCUS: S.BOTTOM_CAP_FOCUS ?? 0,
      BOTTOM_CAP_STRENGTH: S.BOTTOM_CAP_STRENGTH ?? 1.0,

      COLORBURST_ENABLED: S.COLORBURST_ENABLED ?? true,
      COLORBURST_INTENSITY: S.COLORBURST_INTENSITY ?? 0.35,
      COLORBURST_SMOOTHNESS: S.COLORBURST_SMOOTHNESS ?? 0.82,
      COLORBURST_NON_ADJACENT: S.COLORBURST_NON_ADJACENT ?? false,
      COLORBURST_BURST_INTENSITY: S.COLORBURST_BURST_INTENSITY ?? 0.7,
      COLORBURST_BLEND_MODE: S.COLORBURST_BLEND_MODE ?? 'vibrant',

      DISTURBANCE_ENABLED: S.DISTURBANCE_ENABLED ?? true,
      DISTURBANCE_STRENGTH: S.DISTURBANCE_STRENGTH ?? 1.0,
      DISTURBANCE_BASE_LIFETIME: S.DISTURBANCE_BASE_LIFETIME ?? 2.0,
      DISTURBANCE_BASE_RADIUS: S.DISTURBANCE_BASE_RADIUS ?? 145,
    };

    const collections = (S.collections || []).map((col) => {
      const cleanRipples = (col.ripples || []).map((r) => ({
        name: r.name || 'Ripple',
        color: r.color || '#7ab8ff',
        waves: (r.waves || []).map((w) => ({
          frequency: w.frequency,
          amplitude: w.amplitude,
          rate: w.rate,
        })),
      }));

      return {
        name: col.name || 'Collection',
        colorburstIntensity: col.colorburstIntensity ?? 1.0,
        ripples: cleanRipples,
      };
    });

    let suggestedName = 'Snapshot';
    if (collections.length > 0) {
      suggestedName = collections[0].name || 'Snapshot';
      if (collections.length > 1) suggestedName += ` +${collections.length - 1}`;
    }

    return {
      name: suggestedName,
      globals,
      collections,
      // Transient runtime state (this is often what makes it "move")
      disturbances: (S.disturbances || []).map(d => ({ ...d })),
      colorburstConnections: Array.from((S.colorburstConnections || new Map()).entries()),
      t: S.t ?? 0,
    };
  }

  function generateStandaloneHTML(state) {
    const dateStr = new Date().toISOString().slice(0, 10);
    const displayName = state.name || 'Ripple Snapshot';

    // 1. Serialize state
    const g = state.globals || {};
    const cols = state.collections || [];

    const globalsLines = Object.entries(g)
      .map(([k, v]) => `    ${k}: ${typeof v === 'string' ? JSON.stringify(v) : v},`)
      .join('\n');

    const collectionsCode = cols
      .map((col) => {
        const ripplesCode = (col.ripples || [])
          .map((r) => {
            const wavesCode = (r.waves || [])
              .map((w) => `        { frequency: ${w.frequency}, amplitude: ${w.amplitude}, rate: ${w.rate} }`)
              .join(',\n');
            return `    {
      name: ${JSON.stringify(r.name)},
      color: ${JSON.stringify(r.color)},
      waves: [
${wavesCode}
      ]
    }`;
          })
          .join(',\n');

        return `  {
    name: ${JSON.stringify(col.name)},
    colorburstIntensity: ${col.colorburstIntensity ?? 1.0},
    ripples: [
${ripplesCode}
    ]
  }`;
      })
      .join(',\n');

    const disturbancesCode = JSON.stringify(state.disturbances || []);
    const colorburstPairsCode = JSON.stringify(state.colorburstConnections || []);
    const initialT = state.t ?? 0;

    // 2. Pull the EXACT live engine source (Path A)
    const engine = window.__RipplerEngine;
    if (!engine) {
      throw new Error("Rippler engine not exposed. The live page must set window.__RipplerEngine before export.");
    }
    const engineSource = Object.entries(engine)
      .map(([name, fn]) => `const ${name} = ${fn.toString()};`)
      .join('\n\n');

    // 3. Build the emitted script (state first, then real engine, then bootstrap)
    const emittedScript = `
    // --- Exact state at export time ---
    const GLOBALS = {
${globalsLines}
    };
    const EXPORTED_COLLECTIONS = [
${collectionsCode}
    ];

    // Unpack parameters
    let SHAPE_HEIGHT = GLOBALS.SHAPE_HEIGHT;
    let BASE_WIDTH_TOP = GLOBALS.BASE_WIDTH_TOP;
    let BASE_WIDTH_BOTTOM = GLOBALS.BASE_WIDTH_BOTTOM;
    let CHAOS = GLOBALS.CHAOS;
    let TOP_CAP_HEIGHT = GLOBALS.TOP_CAP_HEIGHT;
    let TOP_CAP_FOCUS = GLOBALS.TOP_CAP_FOCUS;
    let TOP_CAP_STRENGTH = GLOBALS.TOP_CAP_STRENGTH;
    let BOTTOM_CAP_HEIGHT = GLOBALS.BOTTOM_CAP_HEIGHT;
    let BOTTOM_CAP_FOCUS = GLOBALS.BOTTOM_CAP_FOCUS;
    let BOTTOM_CAP_STRENGTH = GLOBALS.BOTTOM_CAP_STRENGTH;
    let COLORBURST_ENABLED = GLOBALS.COLORBURST_ENABLED;
    let COLORBURST_INTENSITY = GLOBALS.COLORBURST_INTENSITY;
    let COLORBURST_SMOOTHNESS = GLOBALS.COLORBURST_SMOOTHNESS;
    let COLORBURST_NON_ADJACENT = GLOBALS.COLORBURST_NON_ADJACENT;
    let COLORBURST_BURST_INTENSITY = GLOBALS.COLORBURST_BURST_INTENSITY;
    let COLORBURST_BLEND_MODE = GLOBALS.COLORBURST_BLEND_MODE;
    let DISTURBANCE_ENABLED = GLOBALS.DISTURBANCE_ENABLED;
    let DISTURBANCE_STRENGTH = GLOBALS.DISTURBANCE_STRENGTH;
    let DISTURBANCE_BASE_LIFETIME = GLOBALS.DISTURBANCE_BASE_LIFETIME;
    let DISTURBANCE_BASE_RADIUS = GLOBALS.DISTURBANCE_BASE_RADIUS;

    let t = ${initialT};
    let lastTime = performance.now();
    let TIME_SCALE = 1.0;

    let disturbances = ${disturbancesCode};
    let colorburstConnections = new Map(${colorburstPairsCode});
    let nextRippleId = 2000;

    let collections = EXPORTED_COLLECTIONS.map((col, ci) => ({
      id: 'export-' + ci,
      name: col.name,
      colorburstIntensity: col.colorburstIntensity ?? 1,
      ripples: (col.ripples || []).map((r, ri) => ({
        id: 100 + ci * 20 + ri,
        name: r.name,
        enabled: true,
        color: r.color,
        waves: (r.waves || []).map(w => ({ ...w }))
      }))
    }));

    // Runtime canvas + viewport state (required by all engine functions that close over them)
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d', { alpha: true });

    let width = 0;
    let height = 0;
    let centerX = 0;
    let centerY = 0;
    let dpr = 1;

    // --- Exact engine source from the live app at export time ---
${engineSource}

    // Minimal bootstrap (visualization only)
    function bootstrapStandalone() {
      resize();
      window.addEventListener('resize', resize, { passive: true });
      canvas.addEventListener('pointerdown', e => spawnDisturbance(e.clientX, e.clientY), { passive: true });
      lastTime = performance.now();
      loop();
    }
    bootstrapStandalone();
  `;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Rippler • ${displayName}</title>
  <style>
    :root { --bg: #0a0b0f; }
    html, body { margin:0; padding:0; width:100%; height:100%; overflow:hidden; background:var(--bg); font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    canvas { display:block; width:100vw; height:100vh; }
    .label { position:fixed; bottom:16px; left:16px; font-size:10px; color:rgba(180,190,210,0.5); background:rgba(10,11,15,0.6); padding:4px 8px; border-radius:4px; border:1px solid rgba(255,255,255,0.06); pointer-events:auto; user-select:none; z-index:10; backdrop-filter:blur(6px); }
    .label:hover { color:rgba(200,210,230,0.85); }
    .label.hidden { display:none; }
  </style>
</head>
<body>
  <canvas id="canvas"></canvas>
  <div id="label" class="label" title="Click to hide • [ ] / +/- = speed • 0 = original speed • H = toggle">rippler • ${displayName} — ${dateStr}</div>
  <script>
${emittedScript}
  </script>
</body>
</html>`;
  }

  function wireExportButton() {
    const btn = document.getElementById('export-html-btn');
    if (!btn) return;

    btn.addEventListener('click', () => {
      const name = prompt('Name for this snapshot (optional):', '');
      const state = collectLiveState();
      if (name) state.name = name;

      const html = generateStandaloneHTML(state);
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      const safe = (state.name || 'snapshot').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 60);
      const stamp = new Date().toISOString().slice(0, 10);
      a.download = `ripple-${safe}-${stamp}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });

    btn.addEventListener('mouseenter', () => { btn.style.background = '#3a3a44'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = '#2a2a33'; });
  }

  window.downloadRippleSnapshot = function (name) {
    const state = collectLiveState();
    if (name) state.name = name;
    const html = generateStandaloneHTML(state);
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ripple-${(name || 'snapshot').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireExportButton);
  } else {
    setTimeout(wireExportButton, 30);
  }

  console.log('%c[Rippler] copy.js (clean Path A) loaded — uses exact live engine source.', 'color:#7ab8ff');
})();