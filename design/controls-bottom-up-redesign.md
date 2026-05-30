# Design Document: Bottom-Up Redesign of the Controls System for Rippler

**Status**: Draft for review  
**Date**: 2026-05-30  
**Context**: First major refactoring step for the rippler visualization tool (currently a ~1436-line monolithic `index.html`).  
**Author**: Systems Architecture Analysis (Grok, following explicit bottom-up + long-term modularity mandate)  
**Related**: Recent precise embedding of slow-evolution default data (very low rates including literal `rate: 0`, colors `#c800ff` / `#003870`) in the in-memory collections.

---

## 1. Executive Summary

The Controls subsystem is the primary technical debt and coupling point in the current single-file vanilla application. The imperative `renderAllControls()` (lines 918–1160) plus the parallel static-HTML + imperative-init wiring for Globals (lines 169–299 + 1269–1423) create an unmaintainable, non-composable surface.

A bottom-up redesign starts at the **leaf parameter control** (the Slider primitive with nonlinear mapping), builds reusable components for Waves / Ripples / Collections / Globals, introduces a thin orchestration layer, and defines a clear boundary between the visualization model (canvas + simulation) and the control surface.

The design preserves the current expert-dense aesthetic and immediate live-tweaking feel while creating a realistic path to extract controls into `controls.js` (and eventually web components or a separate package) without a build step initially.

**Core recommendation**: Adopt a **lightweight component model using plain JS factory functions** that return DOM subtrees + expose minimal lifecycle (`update()`). No VDOM, no reactive framework. All controls own their DOM nodes and perform in-place value sync. Direct model mutation (current style) is retained for creative flow, but routed exclusively through control widgets.

---

## 2. Current State Analysis (Ground Truth from Codebase)

### 2.1 File & Scale
- Single file: `index.html` (1436 lines total).
- No `package.json`, no build, no external dependencies — a deliberate creative-tool philosophy that must be respected.
- Canvas simulation + all UI + data + helpers co-located in one `<script>`.

### 2.2 Two Incompatible Control Layers

**Layer A — Static Globals (declarative HTML + imperative glue)**
- Static block occupying lines 169–316 (inside `#controls`): hard-coded `<div class="global-controls">` (169–299) containing 4 shape/chaos sliders + 6 cap sliders + Colorburst subsection (Intensity, Smoothness, Burst Intensity, 2 checkboxes, 1 `<select>` for blend mode, many `style=` attributes on its labels/checkboxes/select at 249–298) + the entire settings-box (302–312, two buttons with inline styles) + the `#ripples-container` mount point (314) that the dynamic layer targets.
- All value display `<span id="val-xxx">` elements.
- Wiring lives entirely in `init()` (lines 1269–1423):
  - Every slider gets `.oninput = (e) => { GLOBAL = parse...; valSpan.textContent = ...; draw(); }`
  - Checkboxes and select follow the same direct mutation pattern.
- No reuse. Every new global parameter duplicates this ~8–12 line pattern.
- Note for PR3: when replacing hard-coded blocks, the settings-box + load/new-collection button wiring (1427–1428) must be considered together with (or preserved alongside) the globals host.

**Layer B — Fully Dynamic Per-Collection / Per-Ripple (the monster)**
- `renderAllControls()` (918–1160): `container.innerHTML = ''`; then `forEach` over `collections`, building via `document.createElement` + massive inline `element.style.xxx = ...` + occasional `innerHTML` (wave groups, lines 1088–1112).
- Examples of inline style sprawl:
  - Collection header: 929–932, 947–952 (name input), 959–961 (save button), 984–992 (mini colorburst slider in header), etc.
  - Ripple header: 1020–1022, 1034–1038, etc.
- Mix of CSS classes (`.collection`, `.ripple`, `.ripple-header`, `.slider-control`, `.wave-group` — defined 108–162) and extensive inline style sprawl: exactly 43 `\.style\.` mutations (primarily inside renderAllControls at 928–1159) + 16 `style=` attributes in the static HTML (colorburst subsection 249–298, settings-box 302–312, various labels/buttons). Examples: colHeader (929–932), nameInput (947–952), burstSlider (990–992), addBtn (1144–1152).
- Wave parameter blocks use template literals for HTML then immediately `querySelectorAll('input')` + manual `.oninput` attachment with duplicated nonlinear math (1118–1134).
- Every structural change (add ripple, delete, expand/collapse, rename collection) calls `renderAllControls()` which **destroys and rebuilds the entire subtree**.
- Expand/collapse state lives in the model (`expanded` flags) and drives re-render.

### 2.3 Data Model (No Separation)
- `collections` array of plain objects (345–378 shows the current "slow-evolution" default with literal `rate: 0` on first wave of first ripple).
- Each collection: `{ id, name, expanded, colorburstIntensity, ripples: [...] }`
- Each ripple: `{ id, name, enabled, expanded, color, waves: [{ frequency, amplitude, rate }, ...] }`
- Globals: 10+ top-level `let` declarations (384–404): `SHAPE_HEIGHT`, `BASE_WIDTH_TOP/BOTTOM`, `CHAOS`, 6 cap params, 5 colorburst params.
- Per-collection `colorburstIntensity` is a hybrid (model field but only used in drawing at 700–702).
- **Direct mutation everywhere**: event handlers do `ripple.enabled = ...; draw();` or `collection.name = ...`.
- Helper `getCollectionForRipple` (822–829) does linear scan with `includes`.
- No schema, no defaults factory (except ad-hoc in `addNewRippleToCollection` 1162–1178 and load path 1211–1224), no validation.
- `nextRippleId` and `DEFAULT_RIPPLE_COLORS` (343) are global mutable state.

### 2.4 Critical Pain Points (Technical Debt Catalog)

1. **Extreme coupling**: Controls, model, and visualization (draw at 426+) are one undifferentiated blob. Changing a slider requires touching model shape, control generation, and simulation code.
2. **Styling hell**: Inconsistent (CSS vs 100+ inline assignments). Adding a new control type requires guessing the current "dark glass" recipe (rgba(15,15,20,0.92), blur(12px), #7ab8ff accent, etc.).
3. **No component model**: `renderAllControls` is the only place new UI can be added. Copy-paste of slider markup + event logic is the development model.
4. **Re-render tax on expert workflow**: Collapse/expand of a deep collection forces full recreation of dozens of elements even though only visibility changed. Numeric value spans are re-created instead of updated.
5. **Nonlinear slider logic duplicated**: `mapSlider` (331–335, power=2.6) + visual transform code appears in wave handlers and is partially re-implemented for freq/rate (1085–1086, 1119–1132). Static globals currently bypass the nonlinear mapping used for wave rate/frequency (shapeHeight 176, chaos 199, all 6 caps 208–245, 4 colorburst 257–273 use direct linear ranges + parse in init handlers 1273–1422). Evaluate case-by-case during PR3 (e.g. chaos may benefit from curve; caps probably should remain linear for 0.01-step precision). Do not introduce changes to global slider feel without explicit side-by-side validation against the current tool running the slow-evolution defaults.
6. **Missing features are hard to add cleanly**:
   - Numeric entry for frequency (title text exists at 1092 but no handler).
   - Per-wave enable/disable or solo.
   - Better visualization of the power curve.
7. **Future extraction blocked**: Any attempt to split `controls/` from `viz/` would require untangling 37 direct `document.getElementById` calls (verified count; includes canvas, ripples-container, dynamic value span updates at 1123/1128/1133, and ~30 in init 1269–1428) and the shared global `collections` / `SHAPE_HEIGHT` etc.
8. **Testability & reproducibility**: Impossible to unit-test a single slider without the entire canvas and animation loop.

The recent embedding of the precise slow-evolution defaults (rates near zero, specific hex colors) makes the current controls surface even more critical: any regression in the low-rate nonlinear mapping or value display precision would be immediately noticeable to the user.

---

## 3. Goals & Non-Goals

### Goals
- Design a **maintainable, composable control surface** for both global parameters and the dynamic collection/ripple/wave hierarchy.
- Enable **incremental migration** from the existing `renderAllControls()` + static init code without breaking the live creative experience.
- Create a **realistic extraction boundary** so controls can live in `controls.js` (or later `src/controls/`) while the simulation remains in the main document or becomes a separate module.
- Preserve (and slightly improve) the current **dense, expert-friendly, low-friction** interaction model: immediate feedback, nonlinear low-value precision, compact layout, dark glass aesthetic.
- Make addition of new parameter types (e.g., per-wave phase offset, new cap modes) a 5–15 minute task instead of a risky copy-paste session.
- Surface clear **trade-offs** rather than silver bullets.

### Non-Goals (for this controls-first phase)
- Full application rewrite or introduction of a bundler.
- Implementing undo/redo, history, or immutable data (those can come later on top of a clean controls layer).
- Redesigning the canvas simulation or visual algorithms.
- Adding significant new UI features beyond what is needed to replace current controls 1:1.
- Web Components v1 in the first few PRs (optional later refinement).

---

## 4. Proposed Architecture

### 4.1 Guiding Principles (Bottom-Up)

1. **Start from the parameter primitive**. Every slider (global or wave) should be an instance of the same `createSlider(...)` factory.
2. **Own your DOM**. Each control component creates its subtree once and updates it in place. Parents compose children; they do not destroy them on every model tweak.
3. **Explicit boundaries over magic**. Controls read/write the model via two narrow surfaces:
   - `getValue()` / `setValue(v)` closures (or accessor objects).
   - Optional `onCommit()` or `requestDraw()` callbacks.
4. **Keep mutation model for now**. The creative "feel" of directly poking numbers that immediately affect the canvas is valuable. We add structure around it, not a full immutable store yet.
5. **Theme as data**. All aesthetic tokens live in CSS custom properties. JS only sets data attributes or classes.

### 4.2 Layered Model (Recommended)

```
Visualization Layer (unchanged initially)
    ↑ draw() reads globals + collections shape
    |
Parameter / Model Access Layer (thin)
    ↑ get/set accessors + "dirty" notification (optional batching)
    |
Controls Component Layer
    - createSlider(config)
    - createWaveEditor(ripple, waveIndex, requestDraw)
    - createRippleCard(collection, rippleIndex, ...)
    - createCollectionPanel(...)
    - createGlobalsPanel(globalsRef, requestDraw)
    |
Orchestrator (replaces renderAllControls + parts of init)
    - mountControls(rootEl, model)
    - handles collection add/delete, expand state toggles via component APIs
    |
Data (mostly unchanged POJOs + the 10+ global lets)
```

### 4.3 Component Model Recommendation: Lightweight Factories + In-Place Mutation

**Primary choice**: Plain JavaScript factory functions returning `{ element, update() }` objects.

**Strengthened createSlider contract (mandatory for PR2; must be implemented before any usage in PR3/PR4)**:

The factory *must* support the frequency case (visual proxy slider range completely decoupled from model range + power curve), the rate case, and the linear amplitude case. A simple `{min, max, power}` on the *slider's own* range is insufficient (as the original weak skeleton assumed).

Required configuration shape (exact names to be finalized in PR2 but this is the minimum API):

```js
function createSlider({
  label,
  // Model access (current POJO or globals)
  getValue,          // () => number   (reads from collections[...].waves[i].frequency etc.)
  setValue,          // (v) => void    (writes + typically closes over requestDraw)
  // Slider (visual) range — what the <input type=range> actually exposes to the user
  visualMin, visualMax, visualStep,
  // Model range (for frequency this is 0–100000; for rate 0–1; for amplitude 0–90)
  modelMin, modelMax,
  // Power curve exponent for nonlinear mapping (2.6 for freq and rate; 1 or omitted for linear amplitude)
  power = 1,
  // Display formatting
  precision = 2,
  // Optional: fully custom bidirectional transforms (highest priority if supplied)
  mapVisualToModel,  // (visualValue) => modelValue
  mapModelToVisual,  // (modelValue) => visualValue   (for setting slider position from current model)
  // Lifecycle / side effects
  onChange,          // () => void     (the component calls this after setValue; orchestrator usually passes () => requestDraw())
  // Optional id prefix for future numeric editing overlays on the value span
  paramKey
})
```

**Canonical mapping implementation (generalized from current mapSlider + duplicated freq code)**:
- PR1 or PR2 will produce (and own) a single source-of-truth pair:
  ```js
  // Generalized from index.html:331 (mapSlider) and the freq-specific code at 1085/1119
  function mapSlider(visualValue, visualMin, visualMax, modelMin, modelMax, power = 2.6) {
    const t = (visualValue - visualMin) / (visualMax - visualMin);
    const curved = Math.pow(Math.max(0, t), power);
    return modelMin + curved * (modelMax - modelMin);
  }
  function unmapSlider(modelValue, visualMin, visualMax, modelMin, modelMax, power = 2.6) {
    const t = (modelValue - modelMin) / (modelMax - modelMin);
    const curved = Math.pow(Math.max(0, t), 1 / power);
    return visualMin + curved * (visualMax - visualMin);
  }
  ```
- `createSlider` must use these (or the injected `mapVisualToModel`/`mapModelToVisual`) so there is only one place the 2.6 / 100000 numbers live for frequency.

**Concrete usage examples that the PR2 implementation + tests must satisfy (exact formulas from current codebase)**:
- Frequency (wave): `createSlider({ ..., visualMin:0, visualMax:100, visualStep:0.1, modelMin:0, modelMax:100000, power:2.6, precision:2, mapVisualToModel: v => mapSlider(v,0,100,0,100000,2.6), ... })`. Matches current init visual `Math.pow(wave.frequency / 100000, 1/2.6)*100` (1085) and oninput `Math.pow(...,2.6)*100000` (1121).
- Rate (wave): `visualMin:0, visualMax:1, modelMin:0, modelMax:1, power:2.6` (uses canonical mapSlider(visual,0,1,0,1,2.6) at 1132; visual `pow(rate/1, 1/2.6)` at 1086).
- Amplitude (wave): linear — `power:1` (or omitted), `modelMin:0, modelMax:90, visualMin:0, visualMax:90`.
- All static globals in PR3 will use the same factory (initially with power=1 / direct ranges, later evaluated per Issue 3).

The returned object must still be `{ element, update() }`. `update()` must set both the slider position (via the inverse map) *and* the value span with correct `.toFixed(precision)`. The component owns the value span DOM node so numeric editing (recommendation §6) can be attached later without id hacks.

This contract guarantees "identical slider feel" on the slow-evolution default (rate:0 + near-zero rates) before any PR3 porting begins. PR2 success criteria below are updated accordingly. All wave editors will pass the freq-specific params; the primitive itself becomes the unification point for the previously duplicated logic (pain point 5, 2.4).

**Why not alternatives? (Trade-off analysis)**

- **Web Components / Custom Elements**: Excellent encapsulation and future reusability (`<ripple-slider>`). Downside: more boilerplate (shadow DOM optional but tempting), attribute/property sync ceremony, and slightly heavier for a 1.4k LOC creative sketch. **Recommendation**: Defer to Phase 3 or 4 of the PR plan (after the factory model proves itself). They become a natural evolution once controls are in their own file.
- **Full reactive system** (Signals, mini-Vue, etc.): Overkill. Adds mental model and bundle (even if tiny) for a tool where the "reactivity" surface is < 50 parameters total. Risk of losing the directness that makes the tool feel alive.
- **Pure functions + virtual DOM diff**: Requires either adopting a tiny vdom lib or writing one. Unnecessary for this density; in-place updates on owned subtrees are simpler and have lower constant factors.
- **Classes**: Acceptable (could do `class SliderControl { constructor(cfg){...} mount(parent){} update(){} }`). Factories are slightly lighter for the current "no build, copy-paste friendly" culture.

**Hybrid path (pragmatic)**: Start with factories. Once stable and extracted, a small number of the leaf primitives can be promoted to Custom Elements with almost no behavior change.

### 4.4 Styling Strategy

**Preserve the dark glass aesthetic exactly** (critical for user continuity):
- Backgrounds: `rgba(15,15,20,0.92)`, `rgba(255,255,255,0.03/0.035)`
- Borders, text, accents unchanged (#ddd, #888, #7ab8ff accent-color)
- Backdrop blur, border-radius 6–10px, font 10–12px

**Improvements**:
- Introduce a `:root` or `#controls` block of CSS custom properties at the top of the existing `<style>` (or extracted stylesheet later):
  ```css
  --bg-panel: rgba(15,15,20,0.92);
  --bg-subtle: rgba(255,255,255,0.035);
  --text-primary: #ddd;
  --text-secondary: #888;
  --accent: #7ab8ff;
  --border: rgba(255,255,255,0.08);
  --radius: 6px;
  ```
- All new component factories only set `className` and `dataset.*`. Zero (or near-zero) `.style.xxx =` in the new code.
- Move the existing inline style assignments (the 43 `.style.` mutations + 16 `style=` attributes) into the CSS layer during migration PRs (they become data attributes or additional classes like `.compact-header`, `.wave-row`). Thematic ones must be eliminated from new factory code per the §8 metric.
- Keep `font-variant-numeric: tabular-nums` for value displays (already present at line 147).

**Risk**: Over-cleaning the CSS can accidentally change spacing/padding that expert users have muscle memory for. The 43 `.style.` + 16 `style=` sites must be audited individually. Every visual delta must be reviewed side-by-side with the current running tool (see updated success metric in §8).

### 4.5 Binding to the Existing Data Model

**Short-term (recommended for first 4–5 PRs)**: No change to the shape of `collections` or the global `let`s.

- Globals panel receives an object of accessors:
  ```js
  { shapeHeight: { get: () => SHAPE_HEIGHT, set: v => { SHAPE_HEIGHT = v; } }, ... }
  ```
- Dynamic parts close over `collections[colIndex].ripples[rippleIndex].waves[waveIndex]` (or pass indices + a root reference).
- `requestDraw()` is a simple function that the orchestrator provides; it just calls the existing `draw()`.

**Medium-term option** (after controls are stable): Introduce a tiny `Model` facade or "Store" object that holds the data and emits a `"change"` event (or has a `subscribe` for the orchestrator). This is the natural seam if/when the project splits into `rippler-core` (sim) + `rippler-controls`.

**Strong warning**: Do not introduce a full immutable/Redux-style store in the controls redesign. It would be a massive behavior change for a live creative instrument and is out of scope.

### 4.6 Special Concerns for This Tool

- **Nonlinear low-end precision** (the 2.6 power curve + `mapSlider`) is not an implementation detail — it is core UX for the slow-evolution regime the user just locked in (literal `rate: 0` at 359, low rates ~0.007–0.03 at 360–373). The `createSlider` contract (4.3) + canonical `mapSlider`/`unmapSlider` (PR2) are the single source of truth; every usage (including WaveEditor in PR4) must go through them. Static globals bypass these curves today; PR3 will evaluate unification on a per-parameter basis with side-by-side validation (see pain point 5 in 2.4).
- Collapse/expand state must survive re-renders during the migration window.
- Per-collection colorburst intensity slider (the tiny "B" one in the header, lines 978–996) is unusual; treat it as a first-class parameter control.
- Collection and ripple names are editable in place (inputs). This pattern should be a reusable `createInlineEditable` or handled inside the card components.

### 4.7 Redraw Policy (Critical for Parity and "Immediate Feel")

**Current observed behavior in the codebase (documented omissions, verified via grep of handlers)**:
- Some mutations trigger immediate `draw()`; others rely on the continuous `loop()` → `update()` → `draw()` RAF cycle (1258–1261, `requestAnimationFrame(loop)` at init end).
- Explicit omissions (no `draw()` call on mutation):
  - `shapeHeight.oninput` (1273–1276): `SHAPE_HEIGHT = ...; val.textContent = ...;` (no draw).
  - `chaos.oninput` (1378–1381): `CHAOS = ...; val.textContent = ...;` (no draw).
  - Wave amplitude handler (1126–1128): updates value span, no draw().
  - Wave rate handler (1130–1133): `wave.rate = ...; val.textContent = ...;` (no draw(); only frequency handler at 1118–1124 calls `draw()`).
- Many other paths *do* call `draw()` immediately (most globals in init, freq, checkbox toggles, color pickers, per-collection burst slider 993–996, delete/add paths that also call `renderAllControls()`).
- Result: "immediate live-tweaking feel" (goals §3) is *not uniform* today. Visual update for amplitude/rate/shape/chaos may be deferred up to one frame (~16ms at 60fps). This is latent technical debt, not intentional design.

**Policy for the new controls architecture (binding + component contract)**:
- The thin `requestDraw` callback provided to the orchestrator, `createGlobalsPanel`, `createWaveEditor`, `createCollectionHeader`, etc. is the *single* seam for visual sync.
- **All new component factories and their `onChange` / setter paths will invoke `requestDraw()` (or the equivalent `onNeedsDraw` passed to the host) for every value change that mutates model state affecting the canvas.** This includes amplitude, rate, shapeHeight, chaos, and all other parameters.
- `requestDraw` implementation (supplied by caller in `init` or host mount):
  - Default (for parity + responsiveness during migration): `() => draw()` (immediate synchronous call, matching the majority of current handlers).
  - Future option (post-PR6): can be wrapped in `requestAnimationFrame` or a micro-batch if RAF pressure is measured, but the default must deliver the "feels live" experience of the slow-evolution regime.
- During coexistence phases (PR2–PR5), when old handlers and new components run side-by-side, new components follow the *new policy* (always requestDraw on change). Old paths remain unchanged until their PR replaces them. This is explicitly called out in PR success criteria so side-by-side validation catches any perceived difference in "snappiness".
- Value span formatting: new owned-DOM components must replicate exact `.toFixed(2)` (freq/rate/chaos/caps), `.toFixed(1)` (amplitude), and the id-less structure (no more reliance on dynamic `id="col${colIndex}-..."` inside innerHTML). The returned `update()` or exposed `valueEl` must support future numeric editing overlays (see recommendation 2 in §6).
- Comment to be added in model layer (PR1 or PR2): `// Redraw policy: controls call requestDraw() on every affecting mutation. Current omissions (shapeHeight 1273, chaos 1378, wave amp/rate 1126/1130) are latent debt normalized by the new architecture.`

This policy directly addresses the non-uniform immediate feel while guaranteeing "identical behavior and feel" on the user's slow-evolution default (rate:0 case is especially sensitive to any deferred updates during tweaking).

**Implications for binding (update to 4.5)**: Accessor `setValue` implementations (or the oninput inside `createSlider`) close over the supplied `requestDraw`. The example in 4.3 skeleton will be updated in PR2 to show `onChange: () => requestDraw()`.

---

## 5. Incremental Migration Path

**Phase 0 (Foundation)**: No visible change.
- Document the exact data shape + all current parameter semantics.
- Extract pure helpers (`mapSlider`, color conversion functions) if they are not already.

**Phase 1**: New leaf primitives coexist with old code.
- Implement `createSlider`, `createCheckbox`, `createSelect` factories in a new section or temporary file.
- Port one global at a time (start with Chaos or a cap parameter) to prove the primitive.
- Old static HTML + old wiring remains until the last global is ported.

**Phase 2**: Dynamic subtree replacement.
- Build `createWaveEditor`, `createRippleCard`, `createCollectionPanel`.
- Replace the body of `renderAllControls()` with a call to a new `mountCollections(container, collections, requestDraw)`.
- Old function can be deleted once parity (including add/delete/save behavior) is demonstrated.

**Phase 3**: Orchestrator cleanup.
- Move static globals wiring out of `init()`.
- Create a single `createControls(rootEl, { globals, collections, requestDraw })`.
- Remove all remaining direct `getElementById` from control logic.

**Phase 4 (Extraction readiness)**:
- All controls code lives in functions that only require a model reference + callbacks.
- At this point it becomes realistic to cut the controls block into `controls.js`, load it via a `<script src="...">` (still no bundler), or even move toward Custom Elements.

**Rollback safety**: Because we keep the old static HTML and the old `renderAllControls` until late phases, any PR that introduces a regression can be reverted with the app still fully functional.

### 5.1 Explicit Parity Targets for Load/Save/Expand/Per-Collection Colorburst (Addresses Current Lossy Behavior)

The design requires "full parity" on load/save/expand behaviors in PR5 (and throughout migration). Because the current implementation contains *deliberate lossiness*, the target must be stated explicitly before any code is written:

**Current verified behavior (the parity baseline for PR1–PR7)**:
- `loadCollectionFromFile` (1211–1224): Always forces `expanded: false` on the new collection (1214, comment: "// collections start collapsed when loaded") *and* on every ripple inside (1220, comment: "// ripples inside also start collapsed"). It *ignores* any `expanded` fields present in the incoming JSON (even though presets/rippler-many.json contains them, and saveCollection 1182–1185 serializes the full ripple objects including their `expanded` flags).
- `colorburstIntensity`: Hardcoded to `1.0` on import (1215). It is *never* written by `saveCollection` (which only takes `name` + `ripples` at 1183–1184; the per-collection field at collection root is lost on round-trip). `createNewCollection` (1238–1248) sets `1.0`.
- `createNewCollection`: Sets `expanded: true`.
- Expand/collapse toggles (939–942 collection, 1053–1056 ripple) and conditional rendering (1008–1010, 1077–1079) rely on these flags in the in-memory model.
- The baked-in slow-evolution default (345–378) is *never* loaded via the file path; its `expanded: true` states are set at construction and survive only in-memory until manual collapse or reload.

**Decision**: For the controls redesign (PR1–PR7), the *required parity target is exact reproduction of the current observed lossy behavior*. 
- New `mountCollections` / collection and ripple card components must initialize `expanded` exactly as the old `renderAllControls` + load path do (force false on import for both collection and ripples; respect in-memory flags otherwise).
- `colorburstIntensity` per-collection must be reset to 1.0 on load (matching 1215) and the tiny "B" header slider (978–996) must continue to exist and mutate the field.
- Save behavior remains unchanged (no persistence of `expanded` for collections or `colorburstIntensity`).
- Only after PR7 (post-extraction) may a follow-on enhancement make save/load fully round-trip the full state (with a migration note for existing presets).

This decision is recorded here and must be implemented as comments in the load/save helpers during PR5. The in-memory slow-evolution collection (345–378) is unaffected because it is constructed directly, not via load. PR5 success criteria (updated) and all side-by-side tests must validate against this explicit baseline. Treating the lossiness as "bug to fix during redesign" would violate the "identical behavior and feel" mandate for the user's recently embedded defaults and workflow.

---

## 6. Concrete Recommendations & Open Questions

1. **Single source of truth for parameter metadata** (future win): After the primitives exist, define a `PARAMETERS` object or per-section descriptors. This enables (a) automatic generation of some panels, (b) better preset system, (c) self-documenting UI tooltips.
2. **Numeric editing for frequency**: Implement the hinted behavior (dblclick on the `.slider-value` span opens a small `<input type="number">` overlay). This is high value for expert users and becomes trivial once the value display is owned by a component.
3. **Keyboard accessibility**: Current tool has almost none. Adding `tabindex` + arrow key handling on sliders can be done per-component without global changes.
4. **Testing strategy**: For a visual tool, "golden image" or manual side-by-side is realistic. Unit tests can cover the mapping functions and the `createSlider` value round-tripping in isolation.
5. **Performance**: Rebuilding 50–100 DOM nodes on every collection expand is currently acceptable because N is tiny. The new design should keep it acceptable even if someone creates 20 collections × 8 ripples × 6 waves.

**Weak points in this proposal**:
- Even well-factored factory components will still feel "imperative" compared to a modern framework. Some developers will want to push for a tiny reactive layer later.
- The global `let` variables remain a source of coupling until a later model extraction PR.
- CSS variable migration can introduce subtle layout shifts if padding/margin values are not measured exactly.

---

## 7. PR Plan (Ordered, Independently Reviewable)

Each PR must leave the application in a runnable, non-regressed state. "Independently reviewable" means a reviewer can check out that PR alone and see a coherent delta with clear before/after behavior.

**PR 1: Data Model Documentation & Pure Helpers Extraction** (no behavior change)
- Add a top-of-file or new `model.js` (if we decide on multi-file early) JSDoc describing the exact shape of `collections`, all globals, and invariants (e.g., rate ≥ 0, frequency ≥ 0).
- Extract `mapSlider`, `amplitudeEnvelope`, and the color helpers (`hexToRgb` at 812, `getMixedBurstColor` at 832 (the main mixer used by draw), `rgbToHsl` at 869, `hslToRgb` at 889) into clearly named pure functions with unit-test comments (even if tests are manual at this stage).
- Add the CSS custom property block under `:root` or `#controls` with the current values (no style changes yet).
- **Success criteria**: `git diff` touches only comments + extraction + new CSS vars that are not yet consumed.

**PR 2: Implement Core Parameter Primitives (createSlider + friends)**
- Add the generalized `mapSlider` / `unmapSlider` pair (source of truth for all power curves) + `createSlider(config)` factory satisfying the *full contract* defined in 4.3 (visual proxy ranges + modelMin/modelMax + power + optional custom map/unmap functions; exact support for frequency visual 0-100 ↔ model 0-100000 power 2.6, rate 0-1 power 2.6, amplitude linear).
- Include comprehensive inline "unit-test-style" comments + console-exposed test harness that round-trips the exact three curves from the current codebase (1085–1086, 1119–1132, mapSlider 331) against the slow-evolution default values.
- Add thin wrappers or options for checkbox and select (or just document that they stay simple for now).
- Place the new code after the existing helpers but before `renderAllControls`.
- Add a temporary debug panel or console-exposed test that exercises the new slider against a dummy model (no effect on main UI).
- **Success criteria**: New code present and correct; old controls untouched and working. The factory + mapping functions exactly reproduce (and own) the frequency (0–100000 / 2.6), rate (0–1 / 2.6), and amplitude (linear) behaviors with zero divergence. Redraw Policy integration shown (onChange path calls requestDraw). Ready for safe use in PR3/PR4.

**PR 3: Port Static Global Controls to New Primitives (incremental)**
- One or two globals per sub-PR if needed, but aim for one logical PR.
- Replace the hard-coded HTML blocks for the chosen globals with containers that the new orchestrator will populate.
- Wire the new `createGlobalsPanel(...)` (or individual calls) inside `init()`, removing the old direct `.oninput` assignments for those parameters.
- Keep the old HTML elements temporarily (hidden or progressively removed) so rollback is trivial.
- Verify exact same numeric behavior *and redraw timing semantics* (new components follow Redraw Policy §4.7: always invoke `requestDraw()` on every value mutation; old omitted paths like shapeHeight/chaos/wave-amp/rate are normalized only when replaced). Side-by-side validation against running slow-evolution default required.
- **Success criteria**: User can no longer tell (visually or behaviorally, including snappiness of live tweaks on low-rate waves) that those parameters now use the new code. All new handlers satisfy the Redraw Policy (4.7); current omissions documented as debt.

**PR 4: Build Ripple / Wave Components**
- Implement `createWaveEditor(collectionRef, rippleIndex, waveIndex, requestDraw)`.
- Implement `createRippleCard(...)` composing header (checkbox + color + name + expand + delete) + wave editors + the per-ripple color picker.
- Preserve exact current expand/collapse, delete, and add-ripple behaviors.
- **Success criteria**: These components can render a single ripple's controls identically to today when mounted in isolation.

**PR 5: Replace renderAllControls() Body with New Collection Orchestrator**
- Implement `mountCollections(container, collections, requestDraw)` (or equivalent) using the new cards.
- Update `renderAllControls` (or rename/introduce `renderDynamicControls`) to delegate to the new mount logic.
- Handle collection-level header (including the special tiny colorburst "B" slider) via a `createCollectionHeader`.
- Delete or comment out large sections of the old imperative creation code.
- Full parity test (see also explicit parity targets in 5.1 below and Redraw Policy 4.7): load the user's slow-evolution default (in-memory at 345-378), the preset file, create new ripples/collections, save, expand/collapse deeply (all states preserved exactly as current code does), tweak low rates (including rate:0 and near-zero), verify identical numeric display formatting (.toFixed) and immediate redraw behavior.
- **Success criteria**: The dynamic half of the UI is now built from components; old `renderAllControls` is either gone or a 10-line shell. All new components (WaveEditor, cards, collection headers) follow Redraw Policy (always requestDraw on mutation). Current load/save/expand/colorburstIntensity lossiness reproduced exactly as the baseline (see 5.1). No regression in "immediate feel" for the embedded slow-evolution data.

**PR 6: Unify Globals + Dynamic under One Controls Host + Remove Legacy Wiring**
- Create the top-level `createControlsHost(controlsEl, model, { onNeedsDraw })`.
- Port remaining globals if any.
- Remove the last direct `getElementById` + `.oninput` assignments from `init()`.
- Clean up any temporary dual-rendering or hidden legacy DOM.
- **Success criteria**: All control creation and event wiring for both layers flows through the new component system. `init()` becomes dramatically smaller.

**PR 7 (Optional but recommended): Polish & Extraction Preparation**
- Implement the missing numeric frequency editor (dblclick on value span).
- Add a small number of data attributes (`data-param="rate"`, `data-ripple-id`) for easier future debugging or E2E.
- Extract the entire controls block (factories + host + CSS) into a separate `<script>` tag sourcing `controls.js` (still served from same origin, no build).
- Update README with new internal structure notes.
- Add explicit compatibility note (see also Issue 10 resolution): after extraction, local `file://` usage (the primary "Just open `index.html`" workflow per README:22) may encounter browser restrictions on cross-file `<script src>`. Document that users should use a trivial local server (e.g. `python -m http.server`) for the split version, or retain an inline-concatenated single-file artifact as the canonical distribution for zero-config creative use. A build step that only concatenates (no runtime deps) is acceptable solely for distribution.
- **Success criteria**: A future "split the project" effort can treat `controls.js` as a mostly self-contained starting point. The self-contained single-file promise of the creative tool is preserved (no forced server requirement for the default experience).

**Later (post this redesign series)**:
- PR series for model extraction / simulation module boundary.
- Evaluation of promoting key primitives to Custom Elements.
- Potential introduction of a minimal signals library only if real pain emerges.

---

## 8. Success Metrics & Review Checklist

When the redesign is complete:
- Adding a brand new global parameter (e.g., "Global Rate Scale") takes < 15 lines in the new system and reuses the slider primitive.
- `renderAllControls` no longer exists or is < 20 lines of orchestration.
- Zero `.style.*` assignments in the new factory/orchestrator code for *thematic* properties (colors, backgrounds, radii, blur, fonts, padding, borders). Minimal dynamic styles (e.g. compact widths like the 60px burst slider in headers, absolute positioning for future numeric overlays) are acceptable if they use CSS variables or data attributes where possible. All pre-existing inline styles in the static HTML (the 16 `style=` attributes) and the 43 `.style.` mutations must be audited during migration; each is either moved to CSS or explicitly justified. Side-by-side visual review against the running tool remains mandatory for every delta.
- The slow-evolution default (rate: 0, specific colors) produces identical output and identical slider feel.
- A reviewer can understand the control surface by reading 3–4 small factory functions instead of one 240-line monster.
- It is obvious where one would cut the file to produce a `controls/` directory.

**Reviewer red flags to watch for**:
- Introduction of new global mutable state.
- Changes to the exact power-curve math or display precision.
- Accidental tightening or loosening of spacing that alters muscle memory.
- Any new dependency (even a 2 kB one).

---

This design document treats the current state with the precision it deserves and provides a concrete, low-risk path forward that respects both the creative nature of the tool and the long-term desire to escape the single-file monolith.

The next step after review is to begin **PR 1** (model docs + helpers + CSS vars).