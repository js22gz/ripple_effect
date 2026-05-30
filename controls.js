
// ============================================================
// Pure Helpers (extracted for controls self-containment)
// These are used by createSlider and should be available
// when controls.js runs.
// ============================================================

function mapSlider(visualValue, min, max, power = 2.6) {
  const t = (visualValue - min) / (max - min);
  const curved = Math.pow(Math.max(0, t), power);
  return min + curved * (max - min);
}

function unmapSlider(realValue, min, max, power = 2.6) {
  const t = (realValue - min) / (max - min);
  const curved = Math.pow(Math.max(0, Math.min(1, t)), 1 / power);
  return min + curved * (max - min);
}

function amplitudeEnvelope(u) {
  return Math.pow(Math.sin(u * Math.PI), 1.1);
}
// controls.js
// Extracted control system for rippler (PR 5+ extraction phase)
// 
// This file contains all the UI primitives and orchestrators for the controls.
// It depends on:
//   - A `collections` array (mutable data model)
//   - Global parameter variables (or accessors) from the host
//   - A `requestDraw()` callback provided by the host
//
// It must be loaded *after* the data model is defined but before the host
// calls renderAllControls() or init().
//
// Designed to remain zero-dependency and runnable by simply opening
// index.html (or via a trivial local server for script src).

// ============================================================
// PR 2 Primitives
// ============================================================

/**
 * Creates a high-precision slider control.
 * Supports visual proxy ranges and power curves.
 */
function createSlider({
  label,
  getValue,
  setValue,
  visualMin = 0,
  visualMax = 100,
  modelMin,
  modelMax,
  step = 0.1,
  power = null,
  map = null,
  unmap = null,
  precision = 2,
  format,
  onChange,
}) {
  const root = document.createElement('div');
  root.className = 'slider-control';

  const labelEl = document.createElement('div');
  labelEl.className = 'slider-label';

  const nameSpan = document.createElement('span');
  nameSpan.className = 'label';
  nameSpan.textContent = label;

  const valueSpan = document.createElement('span');
  valueSpan.className = 'slider-value';
  valueSpan.style.fontVariantNumeric = 'tabular-nums';

  const input = document.createElement('input');
  input.type = 'range';
  input.min = visualMin;
  input.max = visualMax;
  input.step = step;

  labelEl.appendChild(nameSpan);
  labelEl.appendChild(valueSpan);
  root.appendChild(labelEl);
  root.appendChild(input);

  const usePower = power != null && power !== 1;
  const effectiveMap = map || (usePower
    ? (v) => mapSlider(v, modelMin, modelMax, power)
    : (v) => v);
  const effectiveUnmap = unmap || (usePower
    ? (v) => unmapSlider(v, modelMin, modelMax, power)
    : (v) => v);

  function sync() {
    const real = getValue();
    const visual = effectiveUnmap(real);
    input.value = visual;

    if (format) {
      valueSpan.textContent = format(real);
    } else {
      valueSpan.textContent = real.toFixed(precision);
    }
  }

  input.oninput = () => {
    const visual = parseFloat(input.value);
    const real = effectiveMap(visual);
    setValue(real);
    sync();
    if (onChange) onChange(real);
  };

  sync();

  return {
    element: root,
    update: sync,
    valueSpan,
  };
}

/**
 * Simple checkbox primitive.
 */
function createCheckbox({ label, getValue, setValue, onChange }) {
  const wrapper = document.createElement('label');
  wrapper.style.display = 'flex';
  wrapper.style.alignItems = 'center';
  wrapper.style.gap = '6px';
  wrapper.style.cursor = 'pointer';
  wrapper.style.fontSize = '10px';
  wrapper.style.color = '#aaa';

  const input = document.createElement('input');
  input.type = 'checkbox';

  const text = document.createElement('span');
  text.textContent = label;

  wrapper.appendChild(input);
  wrapper.appendChild(text);

  function sync() {
    input.checked = !!getValue();
  }

  input.onchange = () => {
    setValue(input.checked);
    if (onChange) onChange(input.checked);
  };

  sync();

  return { element: wrapper, update: sync };
}

/**
 * Simple select primitive.
 */
function createSelect({ label, getValue, setValue, options, onChange }) {
  const wrapper = document.createElement('div');
  wrapper.style.marginBottom = '8px';

  const labelEl = document.createElement('div');
  labelEl.style.fontSize = '10px';
  labelEl.style.color = '#888';
  labelEl.style.marginBottom = '2px';
  labelEl.textContent = label;

  const select = document.createElement('select');
  select.style.width = '100%';
  select.style.background = '#2a2a33';
  select.style.color = '#ccc';
  select.style.border = '1px solid #555';
  select.style.fontSize = '11px';
  select.style.padding = '3px 4px';
  select.style.borderRadius = '4px';

  options.forEach(opt => {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    select.appendChild(o);
  });

  wrapper.appendChild(labelEl);
  wrapper.appendChild(select);

  function sync() {
    select.value = getValue();
  }

  select.onchange = () => {
    setValue(select.value);
    if (onChange) onChange(select.value);
  };

  sync();

  return { element: wrapper, update: sync };
}

// ============================================================
// PR 4 Dynamic Components
// ============================================================

function createWaveEditor(ripple, waveIndex, requestDraw) {
  const wave = ripple.waves[waveIndex];
  const container = document.createElement('div');
  container.className = 'wave-group';

  // Frequency uses visual proxy 0-100 → 0-100000 with power 2.6.
  // We use a very fine step here so that the tiny visual values produced by
  // unmapSlider() for low real frequencies are not snapped to 0 by the native range input.
  container.appendChild(
    createSlider({
      label: `Wave ${waveIndex + 1} · Frequency`,
      getValue: () => wave.frequency,
      setValue: v => { wave.frequency = v; },
      visualMin: 0,
      visualMax: 100,
      modelMin: 0,
      modelMax: 100000,
      step: 0.001,          // fine step is critical for low-end nonlinear sliders
      power: 2.6,
      precision: 2,
      onChange: () => requestDraw(),
    }).element
  );

  container.appendChild(
    createSlider({
      label: 'Amplitude',
      getValue: () => wave.amplitude,
      setValue: v => { wave.amplitude = v; },
      visualMin: 0,
      visualMax: 90,
      modelMin: 0,
      modelMax: 90,
      step: 0.5,
      power: 1,
      precision: 1,
      onChange: () => requestDraw(),
    }).element
  );

  // Rate uses a visual proxy slider (0-100) mapped to model range 0-1 with power=2.6.
  // This is what gives good fine control at the very low rates used in the slow-evolution default.
  container.appendChild(
    createSlider({
      label: 'Rate',
      getValue: () => wave.rate,
      setValue: v => { wave.rate = v; },
      visualMin: 0,
      visualMax: 100,
      modelMin: 0,
      modelMax: 1,
      step: 0.1,
      power: 2.6,
      precision: 4,
      onChange: () => requestDraw(),
    }).element
  );

  return container;
}

function createRippleCard(collection, rippleIndex, requestDraw, onDeleteRipple) {
  const ripple = collection.ripples[rippleIndex];
  const card = document.createElement('div');
  card.className = 'ripple';

  const header = document.createElement('div');
  header.className = 'ripple-header';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = ripple.enabled !== false;
  checkbox.onchange = () => {
    ripple.enabled = checkbox.checked;
    requestDraw();
  };

  const title = document.createElement('h4');
  title.textContent = ripple.name;

  const colorInput = document.createElement('input');
  colorInput.type = 'color';
  colorInput.value = ripple.color || '#7ab8ff';
  colorInput.oninput = () => {
    ripple.color = colorInput.value;
    requestDraw();
  };

  const expandBtn = document.createElement('button');
  expandBtn.className = 'expand-toggle';

  const delBtn = document.createElement('button');
  delBtn.className = 'delete-btn';
  delBtn.textContent = '×';

  const updateExpandUI = () => {
    const isExpanded = ripple.expanded !== false;
    expandBtn.textContent = isExpanded ? '▼' : '▶';
    wavesContainer.style.display = isExpanded ? '' : 'none';
  };

  expandBtn.onclick = () => {
    ripple.expanded = !(ripple.expanded !== false);
    updateExpandUI();
  };

  title.onclick = () => {
    ripple.expanded = !(ripple.expanded !== false);
    updateExpandUI();
  };

  delBtn.onclick = () => {
    if (onDeleteRipple) onDeleteRipple();
  };

  header.appendChild(checkbox);
  header.appendChild(title);
  header.appendChild(colorInput);
  header.appendChild(expandBtn);
  header.appendChild(delBtn);

  card.appendChild(header);

  const wavesContainer = document.createElement('div');
  wavesContainer.className = 'ripple-controls';

  ripple.waves.forEach((_, wi) => {
    const waveEditor = createWaveEditor(ripple, wi, requestDraw);
    wavesContainer.appendChild(waveEditor);
  });

  card.appendChild(wavesContainer);

  updateExpandUI();

  return card;
}

function createCollectionPanel(collection, colIndex, requestDraw, onDeleteCollection, onSaveCollection, onAddRipple) {
  const panel = document.createElement('div');
  panel.className = 'collection';

  const colHeader = document.createElement('div');

  const colToggle = document.createElement('button');
  colToggle.className = 'expand-toggle';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = collection.name;
  nameInput.className = 'collection-name-input';
  nameInput.onchange = () => {
    collection.name = nameInput.value.trim() || 'Untitled';
  };

  const burstLabel = document.createElement('span');
  burstLabel.textContent = 'B';
  burstLabel.className = 'burst-label';

  const burstSlider = createSlider({
    label: '',
    getValue: () => collection.colorburstIntensity ?? 1.0,
    setValue: v => { collection.colorburstIntensity = v; },
    visualMin: 0,
    visualMax: 1,
    modelMin: 0,
    modelMax: 1,
    step: 0.05,
    power: 1,
    precision: 2,
    onChange: () => requestDraw(),
  });

  const burstSliderEl = burstSlider.element;
  burstSliderEl.style.width = '70px';
  const rangeInput = burstSliderEl.querySelector && burstSliderEl.querySelector('input[type="range"]');
  if (rangeInput) rangeInput.style.width = '60px';

  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.className = 'save-btn';
  saveBtn.onclick = () => {
    if (onSaveCollection) onSaveCollection(colIndex);
  };

  const deleteColBtn = document.createElement('button');
  deleteColBtn.textContent = '×';
  deleteColBtn.className = 'delete-btn';
  deleteColBtn.onclick = () => {
    if (onDeleteCollection) onDeleteCollection();
  };

  const updateColExpandUI = () => {
    const isExpanded = collection.expanded !== false;
    colToggle.textContent = isExpanded ? '▼' : '▶';
    contentWrapper.style.display = isExpanded ? '' : 'none';
  };

  colToggle.onclick = () => {
    collection.expanded = !(collection.expanded !== false);
    updateColExpandUI();
  };

  colHeader.appendChild(colToggle);
  colHeader.appendChild(nameInput);
  colHeader.appendChild(burstLabel);
  colHeader.appendChild(burstSliderEl);
  colHeader.appendChild(saveBtn);
  colHeader.appendChild(deleteColBtn);

  panel.appendChild(colHeader);

  const contentWrapper = document.createElement('div');

  const updateRipples = () => {
    contentWrapper.innerHTML = '';

    collection.ripples.forEach((_, rippleIndex) => {
      const rippleCard = createRippleCard(
        collection,
        rippleIndex,
        requestDraw,
        () => {
          collection.ripples.splice(rippleIndex, 1);
          updateRipples();
          requestDraw();
        }
      );
      contentWrapper.appendChild(rippleCard);
    });

    const addBtn = document.createElement('button');
    addBtn.textContent = '+ Add Ripple';
    addBtn.className = 'add-ripple-btn';
    addBtn.onclick = () => {
      if (onAddRipple) onAddRipple();
    };
    contentWrapper.appendChild(addBtn);
  };

  updateRipples();
  panel.appendChild(contentWrapper);

  updateColExpandUI();

  return panel;
}

// ============================================================
// PR 3 Globals Panel
// ============================================================

function createGlobalsPanel(requestDraw) {
  const root = document.createElement('div');
  root.className = 'global-controls';

  const createGroup = (title) => {
    const g = document.createElement('div');
    if (title) {
      const h = document.createElement('div');
      h.style.fontSize = '10px';
      h.style.color = '#888';
      h.style.margin = '8px 0 4px';
      h.textContent = title;
      g.appendChild(h);
    }
    return g;
  };

  // Shape group
  const shapeGroup = createGroup(null);

  shapeGroup.appendChild(createSlider({
    label: 'Shape Height',
    getValue: () => SHAPE_HEIGHT,
    setValue: v => { SHAPE_HEIGHT = v; },
    visualMin: 200, visualMax: 900,
    modelMin: 200, modelMax: 900,
    step: 10, power: 1, precision: 0,
    onChange: () => requestDraw(),
  }).element);

  shapeGroup.appendChild(createSlider({
    label: 'Base Width Top',
    getValue: () => BASE_WIDTH_TOP,
    setValue: v => { BASE_WIDTH_TOP = v; },
    visualMin: 0, visualMax: 200,
    modelMin: 0, modelMax: 200,
    step: 1, power: 1, precision: 0,
    onChange: () => requestDraw(),
  }).element);

  shapeGroup.appendChild(createSlider({
    label: 'Base Width Bottom',
    getValue: () => BASE_WIDTH_BOTTOM,
    setValue: v => { BASE_WIDTH_BOTTOM = v; },
    visualMin: 0, visualMax: 200,
    modelMin: 0, modelMax: 200,
    step: 1, power: 1, precision: 0,
    onChange: () => requestDraw(),
  }).element);

  shapeGroup.appendChild(createSlider({
    label: 'Chaos',
    getValue: () => CHAOS,
    setValue: v => { CHAOS = v; },
    visualMin: 0, visualMax: 30,
    modelMin: 0, modelMax: 30,
    step: 0.1, power: 2.6, precision: 2,
    onChange: () => requestDraw(),
  }).element);

  root.appendChild(shapeGroup);

  // Top Cap group
  const topCapGroup = createGroup('Top Cap');

  topCapGroup.appendChild(createSlider({
    label: 'Top Cap Height',
    getValue: () => TOP_CAP_HEIGHT,
    setValue: v => { TOP_CAP_HEIGHT = v; },
    visualMin: 0, visualMax: 150,
    modelMin: 0, modelMax: 150,
    step: 1, power: 1, precision: 0,
    onChange: () => requestDraw(),
  }).element);

  topCapGroup.appendChild(createSlider({
    label: 'Top Focus',
    getValue: () => TOP_CAP_FOCUS,
    setValue: v => { TOP_CAP_FOCUS = v; },
    visualMin: -1, visualMax: 1,
    modelMin: -1, modelMax: 1,
    step: 0.01, power: 1, precision: 2,
    onChange: () => requestDraw(),
  }).element);

  topCapGroup.appendChild(createSlider({
    label: 'Top Strength',
    getValue: () => TOP_CAP_STRENGTH,
    setValue: v => { TOP_CAP_STRENGTH = v; },
    visualMin: 0, visualMax: 1,
    modelMin: 0, modelMax: 1,
    step: 0.01, power: 1, precision: 2,
    onChange: () => requestDraw(),
  }).element);

  root.appendChild(topCapGroup);

  // Bottom Cap group
  const bottomCapGroup = createGroup('Bottom Cap');

  bottomCapGroup.appendChild(createSlider({
    label: 'Bottom Cap Height',
    getValue: () => BOTTOM_CAP_HEIGHT,
    setValue: v => { BOTTOM_CAP_HEIGHT = v; },
    visualMin: 0, visualMax: 150,
    modelMin: 0, modelMax: 150,
    step: 1, power: 1, precision: 0,
    onChange: () => requestDraw(),
  }).element);

  bottomCapGroup.appendChild(createSlider({
    label: 'Bottom Focus',
    getValue: () => BOTTOM_CAP_FOCUS,
    setValue: v => { BOTTOM_CAP_FOCUS = v; },
    visualMin: -1, visualMax: 1,
    modelMin: -1, modelMax: 1,
    step: 0.01, power: 1, precision: 2,
    onChange: () => requestDraw(),
  }).element);

  bottomCapGroup.appendChild(createSlider({
    label: 'Bottom Strength',
    getValue: () => BOTTOM_CAP_STRENGTH,
    setValue: v => { BOTTOM_CAP_STRENGTH = v; },
    visualMin: 0, visualMax: 1,
    modelMin: 0, modelMax: 1,
    step: 0.01, power: 1, precision: 2,
    onChange: () => requestDraw(),
  }).element);

  root.appendChild(bottomCapGroup);

  // Colorburst group
  const cbGroup = createGroup('Colorburst');

  cbGroup.appendChild(createSlider({
    label: 'Intensity',
    getValue: () => COLORBURST_INTENSITY,
    setValue: v => { COLORBURST_INTENSITY = v; },
    visualMin: 0, visualMax: 1,
    modelMin: 0, modelMax: 1,
    step: 0.01, power: 1, precision: 2,
    onChange: () => requestDraw(),
  }).element);

  cbGroup.appendChild(createSlider({
    label: 'Smoothness',
    getValue: () => COLORBURST_SMOOTHNESS,
    setValue: v => { COLORBURST_SMOOTHNESS = v; },
    visualMin: 0, visualMax: 0.995,
    modelMin: 0, modelMax: 0.995,
    step: 0.001, power: 1, precision: 3,
    onChange: () => requestDraw(),
  }).element);

  cbGroup.appendChild(createSlider({
    label: 'Burst Intensity',
    getValue: () => COLORBURST_BURST_INTENSITY,
    setValue: v => { COLORBURST_BURST_INTENSITY = v; },
    visualMin: 0, visualMax: 2,
    modelMin: 0, modelMax: 2,
    step: 0.01, power: 1, precision: 2,
    onChange: () => requestDraw(),
  }).element);

  cbGroup.appendChild(createCheckbox({
    label: 'Enable Colorburst',
    getValue: () => COLORBURST_ENABLED,
    setValue: v => { COLORBURST_ENABLED = v; },
    onChange: () => requestDraw(),
  }).element);

  cbGroup.appendChild(createCheckbox({
    label: 'Connect Non-Adjacent Ripples',
    getValue: () => COLORBURST_NON_ADJACENT,
    setValue: v => { COLORBURST_NON_ADJACENT = v; },
    onChange: () => requestDraw(),
  }).element);

  const blendWrapper = document.createElement('div');
  blendWrapper.style.marginTop = '6px';

  const blendLabel = document.createElement('div');
  blendLabel.style.fontSize = '10px';
  blendLabel.style.color = '#888';
  blendLabel.style.marginBottom = '2px';
  blendLabel.textContent = 'Blend Mode';

  const blendSelect = document.createElement('select');
  blendSelect.style.width = '100%';
  blendSelect.style.background = '#2a2a33';
  blendSelect.style.color = '#ccc';
  blendSelect.style.border = '1px solid #555';
  blendSelect.style.fontSize = '11px';
  blendSelect.style.padding = '3px 4px';
  blendSelect.style.borderRadius = '4px';

  [
    { value: 'vibrant', label: 'Vibrant (keeps color best)' },
    { value: 'additive', label: 'Additive (classic)' },
    { value: 'screen', label: 'Screen' },
  ].forEach(opt => {
    const o = document.createElement('option');
    o.value = opt.value;
    o.textContent = opt.label;
    blendSelect.appendChild(o);
  });

  blendWrapper.appendChild(blendLabel);
  blendWrapper.appendChild(blendSelect);
  cbGroup.appendChild(blendWrapper);

  blendSelect.value = COLORBURST_BLEND_MODE;
  blendSelect.onchange = () => {
    COLORBURST_BLEND_MODE = blendSelect.value;
    requestDraw();
  };

  root.appendChild(cbGroup);

  return root;
}

// ============================================================
// PR 5 Orchestrator
// ============================================================

function mountSingleCollection(container, collection, colIndex, requestDraw) {
  const existing = container.querySelector(`[data-collection-index="${colIndex}"]`);
  if (existing) existing.remove();

  const panel = createCollectionPanel(
    collection,
    colIndex,
    requestDraw,
    () => {
      collections.splice(colIndex, 1);
      mountCollections(container, collections, requestDraw);
      requestDraw();
    },
    (idx) => {
      saveCollection(idx);
    },
    () => {
      const lastRipple = collection.ripples[collection.ripples.length - 1];
      const colorIndex = collection.ripples.length % DEFAULT_RIPPLE_COLORS.length;
      const newRipple = {
        id: nextRippleId++,
        name: `Ripple ${collection.ripples.length + 1}`,
        enabled: true,
        expanded: true,
        color: DEFAULT_RIPPLE_COLORS[colorIndex],
        waves: lastRipple ? lastRipple.waves.map(w => ({ ...w })) : [
          { frequency: 3, amplitude: 30, rate: 0.4 }
        ]
      };
      collection.ripples.push(newRipple);
      mountSingleCollection(container, collection, colIndex, requestDraw);
    }
  );

  panel.dataset.collectionIndex = colIndex;
  container.appendChild(panel);
}

function mountCollections(container, collections, requestDraw) {
  container.innerHTML = '';

  collections.forEach((collection, colIndex) => {
    mountSingleCollection(container, collection, colIndex, requestDraw);
  });
}

function renderAllControls() {
  const container = document.getElementById('ripples-container');
  mountCollections(container, collections, draw);
}

// ============================================================
// Temporary Test Harnesses (optional to keep in controls.js)
// ============================================================

window.__ripplerTestSlider = function() {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.bottom = '12px';
  container.style.left = '12px';
  container.style.background = 'rgba(20,22,28,0.95)';
  container.style.border = '1px solid rgba(255,255,255,0.15)';
  container.style.borderRadius = '6px';
  container.style.padding = '10px 12px';
  container.style.zIndex = '9999';
  container.style.minWidth = '220px';

  let value = 1234.5;

  const slider = createSlider({
    label: 'Test Frequency (visual proxy)',
    getValue: () => value,
    setValue: v => { value = v; },
    visualMin: 0,
    visualMax: 100,
    modelMin: 0,
    modelMax: 100000,
    step: 0.001,        // must be fine for power curves at low values
    power: 2.6,
    precision: 0,
    onChange: v => console.log('[PR2 Test] value changed to', v),
  });

  container.appendChild(slider.element);
  document.body.appendChild(container);

  console.log('%c[PR2] Test slider mounted.', 'color:#7ab8ff');
};

window.__ripplerTestCollectionUI = function() {
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '12px';
  container.style.left = '12px';
  container.style.background = 'rgba(20,22,28,0.95)';
  container.style.border = '1px solid rgba(255,255,255,0.2)';
  container.style.borderRadius = '6px';
  container.style.padding = '12px';
  container.style.zIndex = '9999';
  container.style.minWidth = '320px';
  container.style.maxHeight = '80vh';
  container.style.overflowY = 'auto';

  const title = document.createElement('div');
  title.textContent = 'PR 4 Test — Collection UI';
  title.style.fontSize = '11px';
  title.style.fontWeight = '600';
  title.style.color = '#7ab8ff';
  title.style.marginBottom = '10px';
  container.appendChild(title);

  const demoCollection = {
    id: 'test-col',
    name: 'Test Collection',
    expanded: true,
    colorburstIntensity: 1.0,
    ripples: [
      {
        id: 99,
        name: 'Left',
        enabled: true,
        expanded: true,
        color: '#c800ff',
        waves: [
          { frequency: 2.8, amplitude: 38, rate: 0 },
          { frequency: 5.6, amplitude: 17, rate: 0.0077 },
          { frequency: 9.3, amplitude: 21, rate: 0.0146 }
        ]
      },
      {
        id: 100,
        name: 'Right',
        enabled: true,
        expanded: false,
        color: '#003870',
        waves: [
          { frequency: 3.1, amplitude: 41, rate: 0.0114 },
          { frequency: 4.9, amplitude: 19, rate: 0.0310 },
          { frequency: 8.7, amplitude: 7.5, rate: 0.0255 }
        ]
      }
    ]
  };

  const panel = createCollectionPanel(
    demoCollection, 0,
    () => console.log('[PR4 Test] requestDraw called'),
    () => container.remove(),
    () => alert('Save clicked! (demo)'),
    () => {
      demoCollection.ripples.push({
        id: Date.now(),
        name: 'New Ripple',
        enabled: true,
        expanded: true,
        color: '#7affa8',
        waves: [{ frequency: 2.5, amplitude: 30, rate: 0.02 }]
      });
      container.innerHTML = '';
      container.appendChild(title);
      const newPanel = createCollectionPanel(
        demoCollection, 0,
        () => console.log('[PR4 Test] requestDraw called'),
        () => container.remove(),
        () => alert('Save clicked! (demo)'),
        arguments.callee
      );
      container.appendChild(newPanel);
    }
  );

  container.appendChild(panel);
  document.body.appendChild(container);

  console.log('%c[PR 4] Full collection UI test mounted.', 'color:#7ab8ff');
};

// Additional pure helper needed by the copy of getMixedBurstColor inside this file
function mixColors(hex1, hex2, t) {
  const c1 = hexToRgb(hex1);
  const c2 = hexToRgb(hex2);
  const r = Math.round(c1.r * (1 - t) + c2.r * t);
  const g = Math.round(c1.g * (1 - t) + c2.g * t);
  const b = Math.round(c1.b * (1 - t) + c2.b * t);
  return `rgb(${r}, ${g}, ${b})`;
}

// Color conversion helpers (needed by getMixedBurstColor copy in this file)
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 122, g: 184, b: 255 };
}

function rgbToHsl(rgb) {
  let r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s, l: l };
}

function hslToRgb(h, s, l) {
  h /= 360;
  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  };
}
