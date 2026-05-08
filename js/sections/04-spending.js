// 04-spending.js — Section 4: CTHRU demand-side spending + cost-per-beneficiary slider
//
// The slider is the centerpiece. The reader picks an annual per-beneficiary cost,
// the math derives implied caseload from CTHRU-paid totals in real time. The
// spending data is the unmovable input; the assumption is exposed and adjustable.

(function () {
  'use strict';

  const section = document.getElementById('s4');
  const chartEl = document.getElementById('chart-s4-spending');
  if (!section || !chartEl) return;

  let chart, data;
  let costSlider, costDisplay, totalEl, caseloadEl, pctEl, townEl;
  const MA_POP = 7_001_000;

  // For the "town equivalent" output we need a few reference towns.
  // Source: 2020 census + recent MA municipal estimates. Spans 1.5K → 650K so
  // any reasonable slider position lands on a recognizable comparison.
  const REF_TOWNS = [
    { name: 'Boston',        pop:  653000 },
    { name: 'Worcester',     pop:  207000 },
    { name: 'Springfield',   pop:  155000 },
    { name: 'Cambridge',     pop:  118000 },
    { name: 'Lowell',        pop:  115000 },
    { name: 'Brockton',      pop:  105000 },
    { name: 'New Bedford',   pop:   98000 },
    { name: 'Lynn',          pop:   97000 },
    { name: 'Fall River',    pop:   94000 },
    { name: 'Quincy',        pop:   94000 },
    { name: 'Lawrence',      pop:   89000 },
    { name: 'Newton',        pop:   88000 },
    { name: 'Somerville',    pop:   81000 },
    { name: 'Framingham',    pop:   72000 },
    { name: 'Haverhill',     pop:   67000 },
    { name: 'Malden',        pop:   66000 },
    { name: 'Waltham',       pop:   65000 },
    { name: 'Revere',        pop:   62000 },
    { name: 'Plymouth',      pop:   62000 },
    { name: 'Medford',       pop:   59000 },
    { name: 'Taunton',       pop:   58000 },
    { name: 'Peabody',       pop:   54000 },
    { name: 'Methuen',       pop:   53000 },
    { name: 'Everett',       pop:   49000 },
    { name: 'Attleboro',     pop:   46000 },
    { name: 'Salem',         pop:   44000 },
    { name: 'Pittsfield',    pop:   43000 },
    { name: 'Leominster',    pop:   43000 },
    { name: 'Beverly',       pop:   42000 },
    { name: 'Fitchburg',     pop:   41000 },
    { name: 'Marlborough',   pop:   41000 },
    { name: 'Chelsea',       pop:   40000 },
    { name: 'Holyoke',       pop:   38000 },
    { name: 'Woburn',        pop:   40000 },
    { name: 'Watertown',     pop:   35000 },
    { name: 'Braintree',     pop:   39000 },
    { name: 'Andover',       pop:   36000 },
    { name: 'Westfield',     pop:   41000 },
    { name: 'Wellesley',     pop:   29000 },
    { name: 'Burlington',    pop:   26000 },
    { name: 'Concord',       pop:   18000 },
    { name: 'Sudbury',       pop:   19000 },
    { name: 'Lexington',     pop:   34000 },
    { name: 'Weston',        pop:   12000 },
    { name: 'Dover',         pop:    6000 },
    { name: 'Topsfield',     pop:    6500 },
    { name: 'Boxford',       pop:    8400 },
    { name: 'Hamilton',      pop:    7700 },
    { name: 'Carlisle',      pop:    5300 },
    { name: 'Manchester-by-the-Sea', pop: 5400 },
    { name: 'Rockport',      pop:    7600 },
    { name: 'Wenham',        pop:    4800 },
    { name: 'Sherborn',      pop:    4200 },
    { name: 'Lincoln',       pop:    7000 },
    { name: 'Aquinnah',      pop:     400 }
  ];

  async function init() {
    chart = echarts.init(chartEl, 'crisis', { renderer: 'canvas' });
    data = await HAC.loadJSON('data/processed/cthru-spending.json');

    chart.setOption(buildChartOption());
    window.addEventListener('resize', () => chart.resize());

    // wire slider
    costSlider  = document.getElementById('s4-cost-slider');
    costDisplay = document.getElementById('s4-cost-value');
    totalEl     = document.getElementById('s4-total-spend');
    caseloadEl  = document.getElementById('s4-caseload');
    pctEl       = document.getElementById('s4-pct-pop');
    townEl      = document.getElementById('s4-town-equiv');
    costSlider.addEventListener('input', updateDerived);
    updateDerived();
  }

  function buildChartOption() {
    const years = data.years.map(y => 'FY' + String(y).slice(2));
    const cats = data.categories;
    // demand-side first (loud cranberry/gold), supply-side second (cool blue/green) — order matters in stack
    const order = ['public_housing_supply', 'housing_production', 'rental_subsidy', 'ea_shelter'];

    const series = order.map(key => {
      const cfg = cats[key];
      if (!cfg) return null;
      return {
        name: cfg.label,
        type: 'line',
        stack: 'spend',
        data: cfg.by_year,
        symbol: 'none',
        smooth: 0.2,
        lineStyle: { width: 2, color: cfg.color, shadowBlur: 12, shadowColor: cfg.color + '66' },
        areaStyle: {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: cfg.color + 'cc' },
              { offset: 1, color: cfg.color + '22' }
            ]
          }
        },
        emphasis: { focus: 'series' }
      };
    }).filter(Boolean);

    return {
      animation: true,
      animationDuration: 1000,
      grid: { left: 78, right: 28, top: 36, bottom: 48, containLabel: false },
      legend: {
        top: 6, right: 8,
        textStyle: { color: '#f6f9ff', fontSize: 11, fontWeight: 500 },
        itemWidth: 14, itemHeight: 8,
        data: order.map(k => cats[k].label)
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: 'rgba(255,255,255,0.25)' } },
        formatter: (params) => {
          const yr = params[0].axisValue;
          const total = params.reduce((s, p) => s + (p.data || 0), 0);
          const lines = params.map(p => {
            const pct = total ? (p.data / total * 100).toFixed(0) + '%' : '—';
            return `<div style="display:flex;justify-content:space-between;gap:12px;padding:2px 0;font-size:12px">
              <span><span style="display:inline-block;width:8px;height:8px;background:${p.color};border-radius:2px;margin-right:6px;vertical-align:middle"></span>${p.seriesName}</span>
              <b style="font-family:JetBrains Mono,monospace;color:${p.color}">$${(p.data/1e6).toFixed(0)}M  ·  ${pct}</b>
            </div>`;
          }).reverse().join('');
          return `<div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#95a0bb;margin-bottom:6px;">${yr}</div>${lines}<div style="border-top:1px solid rgba(255,255,255,0.12);margin-top:6px;padding-top:5px;display:flex;justify-content:space-between;font-size:13px"><b style="color:#ffd600">Total</b><b style="font-family:JetBrains Mono,monospace;color:#ffd600">$${(total/1e6).toFixed(0)}M</b></div>`;
        }
      },
      xAxis: {
        type: 'category',
        data: years,
        axisLabel: { color: '#c8d2e6', fontSize: 11 },
        boundaryGap: false
      },
      yAxis: {
        type: 'value',
        name: 'Paid spending ($M)',
        nameLocation: 'middle',
        nameGap: 60,
        nameTextStyle: { color: '#95a0bb', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' },
        axisLabel: { color: '#c8d2e6', fontFamily: 'JetBrains Mono, monospace',
          formatter: (v) => '$' + (v / 1e6).toFixed(0) + 'M' }
      },
      series
    };
  }

  function updateDerived() {
    const cost = Number(costSlider.value);
    costDisplay.textContent = cost.toLocaleString();

    // Use FY24 demand-side spending as the headline (full year, post-surge).
    // FY25 partial in this dataset; we want the most recent full FY.
    const demand = data.demand_total_by_year || data.total_by_year;
    const fyTarget = data.years.indexOf(2024) >= 0 ? 2024 : data.years[data.years.length - 1];
    const i = data.years.indexOf(fyTarget);
    const totalDemand = i >= 0 ? demand[i] : demand[demand.length - 1];
    totalEl.textContent = '$' + (totalDemand / 1e6).toFixed(0) + 'M';

    const caseload = Math.round(totalDemand / cost);
    caseloadEl.textContent = caseload.toLocaleString();

    const pct = (caseload / MA_POP * 100).toFixed(2) + '%';
    pctEl.textContent = pct;

    // find the closest-population MA town
    const closest = REF_TOWNS.slice().sort((a, b) => Math.abs(a.pop - caseload) - Math.abs(b.pop - caseload))[0];
    if (closest) {
      townEl.textContent = `${closest.name} (~${(closest.pop / 1000).toFixed(0)}K)`;
    } else {
      townEl.textContent = '—';
    }
  }

  const ready = new IntersectionObserver((entries, obs) => {
    if (entries.some(en => en.isIntersecting)) {
      obs.disconnect();
      init().catch(err => {
        console.error('Section 4 init failed:', err);
        chartEl.innerHTML = '<div style="padding:2rem;color:#ff5d7d;font-family:var(--mono);font-size:0.85rem">Chart failed to load: ' + err.message + '</div>';
      });
    }
  }, { rootMargin: '300px 0px' });
  ready.observe(section);
})();
