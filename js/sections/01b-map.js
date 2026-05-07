// 01b-map.js — Section 1.5: 3D town map of Massachusetts.
// Deck.gl OrbitView-equivalent (MapView with no base map = pure black canvas).
// Each town is a vertical extruded column at its centroid; height + color
// driven by the selected metric. Auto-rotates. Hover for glass tooltip.
// Lazy-loads the 12MB GeoJSON only when the section scrolls into view.

(function () {
  'use strict';

  const section = document.getElementById('s1half');
  const canvas = document.getElementById('map-canvas');
  if (!section || !canvas || !window.deck) return;

  const { Deck, MapView, GeoJsonLayer, ColumnLayer } = window.deck;

  let deckInstance, geojson, stats;
  let activeMetric = 'price_to_income';
  let autoRotate = true;
  let bearing = -25;
  let pitch = 52;

  // ---------- metric configs ----------
  const METRICS = {
    price_to_income: {
      label: 'Price ÷ Income',
      unit: 'x',
      heightScale: 25000,         // meters per unit ratio
      domain: [3, 18],            // healthy → extreme
      legendStops: [3, 5, 8, 12, 20],
      format: (v) => v == null ? '—' : v.toFixed(1) + '×'
    },
    median_sold: {
      label: 'Median Sold $',
      unit: '$',
      heightScale: 0.4,
      domain: [300000, 2500000],
      legendStops: [300000, 600000, 900000, 1500000, 2500000],
      format: (v) => v == null ? '—' : '$' + (v >= 1e6 ? (v/1e6).toFixed(2)+'M' : (v/1e3).toFixed(0)+'K')
    },
    median_dom: {
      label: 'Days on Market',
      unit: 'd',
      heightScale: 5000,
      domain: [10, 90],
      legendStops: [15, 25, 40, 60, 90],
      format: (v) => v == null ? '—' : Math.round(v) + ' days',
      // counter-intuitive: HIGH DOM = market struggling = different visual; flip color
      reverseColor: true
    },
    median_household_income: {
      label: 'Median Income',
      unit: '$',
      heightScale: 2.5,
      domain: [40000, 200000],
      legendStops: [50000, 80000, 110000, 150000, 200000],
      format: (v) => v == null ? '—' : '$' + (v/1000).toFixed(0) + 'K',
      reverseColor: true   // higher income = "good" = cool color
    }
  };

  // ---------- color ramp ----------
  // 5-stop ramp from cool blue → cyan → gold → orange → crimson red
  const RAMP = [
    [ 92, 200, 255],   // cool blue (healthy)
    [120, 220, 200],   // teal
    [243, 193,  75],   // gold (concerning)
    [255, 140,  80],   // orange (extreme)
    [255,  77,  90]    // crimson (catastrophic)
  ];
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rampColor(t, alpha = 230) {
    t = Math.max(0, Math.min(1, t));
    const i = t * (RAMP.length - 1);
    const i0 = Math.floor(i), i1 = Math.min(i0 + 1, RAMP.length - 1);
    const f = i - i0;
    const a = RAMP[i0], b = RAMP[i1];
    return [Math.round(lerp(a[0], b[0], f)),
            Math.round(lerp(a[1], b[1], f)),
            Math.round(lerp(a[2], b[2], f)),
            alpha];
  }
  function metricColor(value, cfg) {
    if (value == null || Number.isNaN(value)) return [40, 50, 70, 60];
    const [lo, hi] = cfg.domain;
    let t = (value - lo) / (hi - lo);
    if (cfg.reverseColor) t = 1 - t;
    return rampColor(t);
  }

  // ---------- load + init ----------
  async function init() {
    showLoading('Loading 351 municipalities…');
    [geojson, stats] = await Promise.all([
      HAC.loadJSON('data/processed/ma-towns.geojson'),
      HAC.loadJSON('data/processed/ma-towns-stats.json')
    ]);
    hideLoading();

    // attach the merged stats to features for tooltip lookups
    const byTown = new Map(stats.rows.map(r => [r.town, r]));

    deckInstance = new Deck({
      parent: canvas,
      width: '100%',
      height: '100%',
      initialViewState: {
        longitude: -71.5,
        latitude: 42.15,
        zoom: 7.4,
        pitch,
        bearing
      },
      controller: { dragRotate: true, doubleClickZoom: false, touchRotate: true },
      views: new MapView({ id: 'map' }),
      onViewStateChange: ({ viewState }) => {
        bearing = viewState.bearing;
        pitch = viewState.pitch;
        return viewState;
      },
      getTooltip: ({ object }) => {
        if (!object) return null;
        const t = object.properties || object;
        const town = t.TOWN || t.town;
        const row = byTown.get(town);
        if (!row) return { html: `<div class="tt-title">${town}</div><div class="tt-row">no sale data</div>`, style: tooltipStyle() };
        const html = `
          <div class="tt-title">${town}</div>
          <div class="tt-row"><span>Price ÷ Income</span><b style="color:#ff4d5a">${row.price_to_income ? row.price_to_income.toFixed(1)+'×' : '—'}</b></div>
          <div class="tt-row"><span>Median sold</span><b>${METRICS.median_sold.format(row.median_sold)}</b></div>
          <div class="tt-row"><span>Median income</span><b>${METRICS.median_household_income.format(row.median_household_income)}</b></div>
          <div class="tt-row"><span>Days on market</span><b>${METRICS.median_dom.format(row.median_dom)}</b></div>
          <div class="tt-row"><span>Sales (12mo)</span><b>${row.sold_count || '—'}</b></div>
        `;
        return { html, style: tooltipStyle() };
      },
      layers: buildLayers()
    });

    drawLegend();
    drawLeaderboard();
    startAutoRotate();
    wireControls();
    window.addEventListener('resize', () => deckInstance && deckInstance.redraw());
  }

  function tooltipStyle() {
    return {
      backgroundColor: 'rgba(15,23,48,0.94)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '10px',
      padding: '12px 14px',
      backdropFilter: 'blur(10px)',
      color: '#eef1f8',
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: '12.5px',
      boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
      minWidth: '220px'
    };
  }

  // ---------- layers ----------
  function buildLayers() {
    const cfg = METRICS[activeMetric];

    // PolygonLayer for outlines (faint, cool — sets the stage)
    const outlines = new GeoJsonLayer({
      id: 'town-outlines',
      data: geojson,
      stroked: true,
      filled: true,
      lineWidthMinPixels: 0.7,
      getFillColor: f => {
        const v = readMetric(f.properties, activeMetric);
        if (v == null) return [12, 20, 38, 220];
        const c = metricColor(v, cfg);
        // very dim wash on the polygon — the column carries the loud color
        return [c[0] * 0.18, c[1] * 0.18, c[2] * 0.18, 200];
      },
      getLineColor: [80, 110, 150, 130],
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 30],
      updateTriggers: { getFillColor: [activeMetric] },
      transitions: { getFillColor: 600 }
    });

    // ColumnLayer for the pillars
    const columnData = geojson.features
      .filter(f => f.properties.centroid && readMetric(f.properties, activeMetric) != null)
      .map(f => ({
        position: f.properties.centroid,
        properties: f.properties,
        value: readMetric(f.properties, activeMetric)
      }));

    const columns = new ColumnLayer({
      id: 'town-columns',
      data: columnData,
      diskResolution: 24,
      radius: 1100,         // meters
      extruded: true,
      pickable: true,
      elevationScale: 1,
      getPosition: d => d.position,
      getElevation: d => Math.max(0, d.value) * cfg.heightScale,
      getFillColor: d => metricColor(d.value, cfg),
      material: {
        ambient: 0.55, diffuse: 0.7, shininess: 80,
        specularColor: [255, 255, 255]
      },
      updateTriggers: {
        getElevation: [activeMetric],
        getFillColor: [activeMetric]
      },
      transitions: {
        getElevation: { duration: 900, easing: t => 1 - Math.pow(1 - t, 3) },
        getFillColor: 600
      }
    });

    return [outlines, columns];
  }

  function readMetric(props, key) {
    if (key === 'median_household_income') return props.Median_Household_Income;
    return props[key];
  }

  // ---------- legend ----------
  function drawLegend() {
    const el = document.getElementById('mapLegend');
    if (!el) return;
    const cfg = METRICS[activeMetric];
    const stops = cfg.legendStops;
    const swatches = stops.map((s, i) => {
      const t = i / (stops.length - 1);
      const c = rampColor(cfg.reverseColor ? 1 - t : t);
      return `<div class="legend-stop">
        <span class="legend-swatch" style="background:rgb(${c[0]},${c[1]},${c[2]})"></span>
        <span class="legend-label">${cfg.format(s)}</span>
      </div>`;
    }).join('');
    el.innerHTML = `<div class="legend-title">${cfg.label}</div><div class="legend-row">${swatches}</div>`;
  }

  // ---------- leaderboard ----------
  function drawLeaderboard() {
    const el = document.getElementById('mapLeaderboard');
    if (!el) return;
    const cfg = METRICS[activeMetric];
    const minN = activeMetric === 'median_dom' ? 20 : 15;
    const rows = stats.rows.filter(r => r.sold_count >= minN && r[activeMetric] != null && readStat(r) != null);
    const ranked = rows.slice().sort((a, b) => readStat(b) - readStat(a));
    const top = ranked.slice(0, 5);
    const bot = ranked.slice(-5).reverse();

    function renderList(label, list) {
      const items = list.map(r => `
        <li>
          <span class="lb-town">${r.town}</span>
          <span class="lb-val">${cfg.format(readStat(r))}</span>
          <span class="lb-sub">$${(r.median_sold/1000).toFixed(0)}K · n=${r.sold_count}</span>
        </li>`).join('');
      return `<div class="lb-col"><div class="lb-head">${label}</div><ol class="lb-list">${items}</ol></div>`;
    }

    el.innerHTML = `
      <div class="lb-title">Where ${cfg.label.toLowerCase()} is most extreme</div>
      <div class="lb-grid">
        ${renderList(activeMetric === 'median_household_income' ? 'Highest income' : 'Most unaffordable', top)}
        ${renderList(activeMetric === 'median_household_income' ? 'Lowest income' : 'Most reachable', bot)}
      </div>
    `;
  }

  function readStat(r) {
    return r[activeMetric];
  }

  // ---------- auto-rotate ----------
  function startAutoRotate() {
    let last = performance.now();
    function tick(now) {
      const dt = (now - last) / 1000;
      last = now;
      if (autoRotate && deckInstance) {
        bearing = (bearing + 4 * dt) % 360;
        deckInstance.setProps({
          viewState: {
            longitude: -71.5, latitude: 42.15, zoom: 7.4,
            pitch, bearing
          }
        });
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // ---------- controls ----------
  function wireControls() {
    document.querySelectorAll('#mapControls button').forEach(btn => {
      btn.addEventListener('click', () => {
        const m = btn.getAttribute('data-metric');
        if (m === activeMetric) return;
        document.querySelectorAll('#mapControls button').forEach(b => b.classList.toggle('active', b === btn));
        activeMetric = m;
        deckInstance.setProps({ layers: buildLayers() });
        drawLegend();
        drawLeaderboard();
      });
    });
    const rotateBtn = document.getElementById('mapRotate');
    if (rotateBtn) {
      rotateBtn.addEventListener('click', () => {
        autoRotate = !autoRotate;
        rotateBtn.classList.toggle('off', !autoRotate);
        rotateBtn.setAttribute('aria-pressed', String(autoRotate));
      });
    }

    // pause auto-rotate while user is interacting
    canvas.addEventListener('pointerdown', () => { autoRotate = false; updateRotateBtn(); });
    function updateRotateBtn() {
      const b = document.getElementById('mapRotate');
      if (b) {
        b.classList.toggle('off', !autoRotate);
        b.setAttribute('aria-pressed', String(autoRotate));
      }
    }
  }

  // ---------- ui helpers ----------
  function showLoading(msg) {
    const el = canvas.querySelector('.map-loading');
    if (el) el.textContent = msg;
  }
  function hideLoading() {
    const el = canvas.querySelector('.map-loading');
    if (el) el.remove();
  }
  function fail(err) {
    canvas.innerHTML = `<div class="map-error">Map failed to load: ${err.message}</div>`;
    console.error(err);
  }

  // ---------- lazy boot ----------
  const boot = new IntersectionObserver((entries, obs) => {
    if (entries.some(e => e.isIntersecting)) {
      obs.disconnect();
      init().catch(fail);
    }
  }, { rootMargin: '600px 0px' });
  boot.observe(section);
})();
