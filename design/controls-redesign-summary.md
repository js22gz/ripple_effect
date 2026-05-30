# Design Summary: Rippler Controls Bottom-Up Redesign

**Target**: `/tmp/grok-design-doc-8bccbb7b.md` (full 8-section document)  
**Date**: 2026-05-30

## Problem (Grounded in Code)
The entire 1436-line `index.html` is one file. Controls are split across two incompatible systems:
- Static Globals HTML (lines 169–299) + 150+ lines of direct `.oninput` mutation in `init()` (1269–1423).
- `renderAllControls()` (918–1160): 240-line imperative monster using `createElement` + hundreds of `element.style.xxx =` + `innerHTML` for waves. Full subtree destroy/rebuild on any structural change.

Data model = raw mutable POJOs in `collections[]` (345–378, recently precisely set to slow-evolution defaults: `rate: 0`, `#c800ff`/`#003870`) + 10+ top-level `let`s. No components, duplicated nonlinear slider math (power 2.6 via `mapSlider` 331), 38 `getElementById` calls, zero extraction seams.

## Goals
Clean, dense, expert-friendly control surface. Realistic path to extract controls into their own file(s)/module(s). Incremental migration with zero behavior regression on the live creative tool.

## Core Proposal
**Lightweight factory components** (`createSlider({getValue, setValue, power, ...})` returning `{element, update()}`) + composition for WaveEditor / RippleCard / CollectionPanel / GlobalsPanel. In-place DOM updates, not VDOM. Direct mutation retained (creative flow), routed through narrow accessors. CSS custom properties for the existing dark-glass aesthetic (preserve every visual detail).

**Why not**:
- Web Components: Defer (good long-term, too much ceremony now).
- Reactive framework / signals: Overkill and risks losing immediacy.
- Full immutable store: Out of scope for controls phase.

## Migration & Modularity
Four-phase path keeps the old code running beside the new until parity. Once complete, controls become a drop-in host that only needs a model reference + `requestDraw` callback — the seam needed for later splitting the monolith.

## PR Plan (7 ordered, reviewable PRs)
1. Model docs + pure helpers extraction + CSS custom props (no visible change).
2. Implement `createSlider` + primitives (coexist with old code).
3. Port static Globals one parameter group at a time.
4. Build WaveEditor + RippleCard + Collection components.
5. Replace body of `renderAllControls()` with new orchestrator (full parity required, including user's slow-evolution data + preset load/save).
6. Single ControlsHost + delete legacy wiring from `init()`.
7. Polish (numeric freq editing), data attrs, extract to `controls.js` (still no build).

## Key Trade-offs & Risks (Explicit)
- Abstraction cost vs. current "just edit the monster" velocity.
- Risk of subtle spacing/padding shifts during CSS cleanup (must side-by-side review).
- Nonlinear low-end curves (critical for rate:0 regime) must be reproduced exactly.
- Still leaves global `let`s and shared `collections` as coupling until later model-extraction work.
- No new dependencies; respects the self-contained creative-tool philosophy.

## Success Criteria
- New parameter = <15 lines using existing primitives.
- `renderAllControls` gone or <20 lines.
- Zero (or near-zero) inline `style.xxx` in new control code.
- Identical behavior and feel on the exact slow-evolution default.
- Clear extraction boundary for future `controls/` directory.

Full rationale, code citations (exact lines), component sketches, and detailed trade-off analysis are in the complete design document.

**Next concrete step (post-approval)**: PR 1 — documentation + helpers + CSS variables only.