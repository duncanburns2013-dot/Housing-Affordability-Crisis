// 01b-map.js — Section 1.5: 2D choropleth map of Massachusetts.
// All 351 municipalities, each polygon shaded by the selected metric.
// Hover reveals the town with a glassmorphism stat card.
// Lazy-loaded — the merged GeoJSON only fetches when the section approaches view.

(function () {
  'use strict';

  const section = document.getElementById('s1half');
  const canvas = document.getElementById('map-canvas');
  if (!section || !canvas || !window.deck) return;

  const { Deck, MapView, GeoJsonLayer } = window.deck;

  let deckInstance, geojson, stats;
  let activeMetric = 'price_to_income';
  let hoveredTown = null;

  // ---------- metric configs ----------
  const METRICS = {
    price_to_income: {
      label: 'Price ÷ Income',
      domain: [3, 18],
      legendStops: [3, 5, 8, 12, 18],
      format: (v) => v == null ? '—' : v.toFixed(1) + '×',
      direction: 'higher-is-worse'
    },
    median_sold: {
      label: 'Median Sold',
      domain: [300000, 2500000],
      legendStops: [300000, 600000, 900000, 1500000, 2500000],
      format: (v) => v == null ? '—' : '$' + (v >= 1e6 ? (v/1e6).toFixed(2)+'M' : (v/1e3).toFixed(0)+'K'),
      direction: 'higher-is-worse'
    },
    median_dom: {
      label: 'Days on Market',
      domain: [10, 90],
      legendStops: [15, 25, 40, 60, 90],
      format: (v) => v == null ? '—' : Math.round(v) + ' days',
      direction: 'higher-is-worse'
    },
    median_household_income: {
      label: 'Median Income',
      domain: [40000, 200000],
      legendStops: [50000, 80000, 110000, 150000, 200000],
      format: (v) => v == null ? '—' : '$' + (v/1000).toFixed(0) + 'K',
      direction: 'higher-is-better'
    }
  };

  // ---------- color ramp (MA palette: vivid green → blue → gold → cranberry) ----------
  const RAMP = [
    [  0, 230, 118],   // green   — affordable / healthy
    [  0, 184, 255],   // blue    — moderate / context
    [255, 214,   0],   // gold    — concerning
    [255, 119,   0],   // orange  — severe
    [255,  23,  68]    // cranberry — extreme
  ];
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rampColor(t, alpha = 235) {
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
    if (value == null || Number.isNaN(value)) return [22, 30, 50, 200];
    const [lo, hi] = cfg.domain;
    let t = (value - lo) / (hi - lo);
    if (cfg.direction === 'higher-is-better') t = 1 - t;
    return rampColor(t);
  }

  function readMetric(props, key) {
    if (key === 'median_household_income') return props.Median_Household_Income;
    return props[key];
  }

  // ---------- init ----------
  async function init() {
    showLoading('Loading 351 municipalities…');
    [geojson, stats] = await Promise.all([
      HAC.loadJSON('data/processed/ma-towns.geojson'),
      HAC.loadJSON('data/processed/ma-towns-stats.json')
    ]);
    hideLoading();

    const byTown = new Map(stats.rows.map(r => [r.town, r]));

    // initial viewport: framed on MA proper
    const initialViewState = {
      longitude: -71.7,
      latitude: 42.18,
      zoom: 7.7,
      pitch: 0,
      bearing: 0,
      maxZoom: 11,
      minZoom: 6.5
    };

    deckInstance = new Deck({
      parent: canvas,
      width: '100%',
      height: '100%',
      initialViewState,
      controller: { dragRotate: false, doubleClickZoom: true, scrollZoom: { speed: 0.5, smooth: true } },
      views: new MapView({ id: 'map' }),
      onHover: ({ object }) => {
        const town = object && object.properties && object.properties.TOWN;
        if (town !== hoveredTown) {
          hoveredTown = town;
          deckInstance.setProps({ layers: buildLayers() });
        }
      },
      getTooltip: ({ object }) => {
        if (!object || !object.properties) return null;
        const t = object.properties;
        const town = t.TOWN;
        const row = byTown.get(town);
        if (!row || row.median_sold == null) {
          return { html: `<div class="tt-title">${town}</div><div class="tt-row"><span>data</span><b>insufficient sales</b></div>`, style: tooltipStyle() };
        }
        const html = `
          <div class="tt-title">${town}</div>
          <div class="tt-row"><span>Price ÷ Income</span><b style="color:#ff1744">${row.price_to_income ? row.price_to_income.toFixed(1)+'×' : '—'}</b></div>
          <div class="tt-row"><span>Median sold</span><b style="color:#ffd600">${METRICS.median_sold.format(row.median_sold)}</b></div>
          <div class="tt-row"><span>Median income</span><b style="color:#00b8ff">${METRICS.median_household_income.format(row.median_household_income)}</b></div>
          <div class="tt-row"><span>Days on market</span><b>${METRICS.median_dom.format(row.median_dom)}</b></div>
          <div class="tt-row"><span>Sales (12 mo)</span><b>${row.sold_count || '—'}</b></div>
        `;
        return { html, style: tooltipStyle() };
      },
      layers: buildLayers()
    });

    drawLegend();
    drawLeaderboard();
    wireControls();
    window.addEventListener('resize', () => deckInstance && deckInstance.redraw());
  }

  function tooltipStyle() {
    return {
      background: 'rgba(8,14,28,0.94)',
      border: '1px solid rgba(0,184,255,0.30)',
      borderRadius: '12px',
      padding: '14px 16px',
      backdropFilter: 'blur(12px)',
      color: '#f6f9ff',
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: '12.5px',
      boxShadow: '0 16px 48px rgba(0,0,0,0.7), 0 0 24px rgba(0,184,255,0.15)',
      minWidth: '240px',
      pointerEvents: 'none'
    };
  }

  // ---------- layers ----------
  function buildLayers() {
    const cfg = METRICS[activeMetric];

    return [
      // base fill — every town shaded by metric, vivid
      new GeoJsonLayer({
        id: 'town-fills',
        data: geojson,
        stroked: true,
        filled: true,
        lineWidthUnits: 'pixels',
        lineWidthMinPixels: 0.6,
        getLineColor: f => f.properties.TOWN === hoveredTown
          ? [255, 255, 255, 255]
          : [255, 255, 255, 60],
        getLineWidth: f => f.properties.TOWN === hoveredTown ? 2.5 : 0.6,
        getFillColor: f => {
          const v = readMetric(f.properties, activeMetric);
          if (v == null) return [22, 30, 50, 200];
          const c = metricColor(v, cfg);
          // brighter on hover
          if (f.properties.TOWN === hoveredTown) return [c[0], c[1], c[2], 255];
          return c;
        },
        pickable: true,
        updateTriggers: {
          getFillColor: [activeMetric, hoveredTown],
          getLineColor: [hoveredTown],
          getLineWidth: [hoveredTown]
        },
        transitions: {
          getFillColor: { duration: 700, easing: t => 1 - Math.pow(1 - t, 3) }
        }
      })
    ];
  }

  // ---------- legend ----------
  function drawLegend() {
    const el = document.getElementById('mapLegend');
    if (!el) return;
    const cfg = METRICS[activeMetric];
    const swatches = cfg.legendStops.map((s, i) => {
      const t = i / (cfg.legendStops.length - 1);
      const c = rampColor(cfg.direction === 'higher-is-better' ? 1 - t : t);
      return `<div class="legend-stop">
        <span class="legend-swatch" style="background:rgb(${c[0]},${c[1]},${c[2]});box-shadow:0 0 12px rgba(${c[0]},${c[1]},${c[2]},0.55)"></span>
        <span class="legend-label">${cfg.format(s)}</span>
      </div>`;
    }).join('');
    el.innerHTML = `
      <div class="legend-title">${cfg.label}</div>
      <div class="legend-row">${swatches}</div>
      <div class="legend-foot">${cfg.direction === 'higher-is-better' ? 'higher = better' : 'higher = worse'}</div>
    `;
  }

  // ---------- leaderboard ----------
  function drawLeaderboard() {
    const el = document.getElementById('mapLeaderboard');
    if (!el) return;
    const cfg = METRICS[activeMetric];
    const minN = activeMetric === 'median_dom' ? 20 : 15;
    const valid = stats.rows.filter(r => r.sold_count >= minN && readStat(r) != null);
    const ranked = valid.slice().sort((a, b) => readStat(b) - readStat(a));
    const top = ranked.slice(0, 6);
    const bot = ranked.slice(-6).reverse();

    const isBetterHigh = cfg.direction === 'higher-is-better';
    const topLabel = isBetterHigh ? 'Highest income' : 'Most extreme';
    const botLabel = isBetterHigh ? 'Lowest income' : 'Most reachable';

    function renderList(label, list, accent) {
      const items = list.map(r => `
        <li>
          <span class="lb-town">${r.town}</span>
          <span class="lb-val" style="color:${accent}">${cfg.format(readStat(r))}</span>
          <span class="lb-sub">$${(r.median_sold/1000).toFixed(0)}K sold · n=${r.sold_count}</span>
        </li>`).join('');
      return `<div class="lb-col"><div class="lb-head" style="color:${accent}">${label}</div><ol class="lb-list">${items}</ol></div>`;
    }

    el.innerHTML = `
      <div class="lb-title">${cfg.label} — leaderboard</div>
      <div class="lb-grid">
        ${renderList(topLabel, top, '#ff1744')}
        ${renderList(botLabel, bot, '#00e676')}
      </div>
    `;
  }
  function readStat(r) { return r[activeMetric]; }

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
