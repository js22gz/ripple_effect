# ripple_effect

An interactive multi-ripple fluid simulation built with vanilla HTML5 Canvas.

Live demo: https://js22gz.github.io/ripple_effect (if you enable GitHub Pages)

## Features

- Multiple independent ripple collections
- Per-ripple controls: enable/disable, color picker, expand/collapse, delete
- Multi-wave sculpting per ripple (frequency, amplitude, rate)
- Expressive cap system (Top/Bottom) with Height, Focus, and Strength
- Global chaos + shape controls
- Advanced colorburst system between overlapping ripples
  - Intensity, smoothness, burst glow, blend modes
  - Optional non-adjacent ripple connections
- Save / load collections as JSON presets
- Fully self-contained — no dependencies, no build step

## Running locally

Just open `index.html` in any modern browser. That's it.

## Loading the included preset

1. Open the demo
2. Click **"Load from File"** in the Settings panel (top right)
3. Select `presets/rippler-many.json`

This loads a rich starting collection with multiple ripples and layered waves.

## Creating standalone snapshots

While the app is running, click **"Export .html"** in the Settings panel (top right).

It instantly captures the *exact current live state* — every slider, every wave parameter, colorbursts, disturbances, everything — and downloads a single, beautiful, completely self-contained `.html` file containing **only** the visualization.

No Node.js, no build step, pure vanilla JavaScript.

You can also trigger it from the browser console:

```js
downloadRippleSnapshot("My Favorite Setting")
```

The exported files are perfect for sharing, archiving favorite moments, or using as pure visual pieces. The canvas stays fully interactive (click or touch to create disturbance bursts).

## Controls overview

- **Left side of the shape** — ripples are distributed evenly across the defined base width
- **Globals panel** — overall shape, chaos, and cap physics
- **Per-ripple panels** — individual wave stacks, colors, and toggles
- **Colorburst section** — controls the glowing interaction zones where ripples cross
- Click **New Collection** to start fresh or **Save** on any collection to export it

## Philosophy

This project explores emergent harmony from simple overlapping sine waves with rich physical constraints and visual mixing. The goal was to create something that feels alive and musical even though it's purely mathematical.

## License

MIT — feel free to use, remix, or learn from the code.
