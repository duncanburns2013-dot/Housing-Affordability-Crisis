// 02-divergence.js — Section 2: price-to-income divergence
// MA home price (cranberry) and MA income (vivid green), indexed to 2000 = 100.
// US income shown as dashed blue context line.
// The cranberry-filled wedge between price and income IS the affordability crisis.
// Step 5 reveals an "alternative history" line — where price would be if 2000's
// ratio had held — and a dramatic gap callout.

(function () {
  'use strict';

  const section = document.getElementById('s2');
  const chartEl = document.getElementById('chart-s2-divergence');
  if (!section || !chartEl) return;

  let chart, data;

  async function init() {
    chart = echarts.init(chartEl, 'crisis', { renderer: 'canvas' });
    data = await HAC.loadJSON('data/processed/income-divergence.json');

    const years = data.years;
    const priceIdx = data.series.ma_home_index;
    const incomeIdx = data.series.ma_income_index;
    const usIncomeIdx = data.series.us_income_index;
    // gap series, stacked on income to make the wedge fill
    const gapIdx = priceIdx.map((p, i) => p - incomeIdx[i]);

    // alternative-history price line: if 2000's ratio had held, indexed price would == indexed income
    // (since both indexed to 100 in 2000, holding the ratio means the indexed price tracks income)
    const altPriceIdx = incomeIdx.slice(); // visually identical to income line

    chart._series = { years, priceIdx, incomeIdx, usIncomeIdx, gapIdx, altPriceIdx };

    chart.setOption(buildOption(0));
    window.addEventListener('resize', () => chart.resize());
    applyStep(1);
  }

  function buildOption(step) {
    const { years, priceIdx, incomeIdx, usIncomeIdx, gapIdx } = chart._series;

    return {
      animation: true,
      animationDuration: 900,
      grid: { left: 64, right: 28, top: 36, bottom: 52, containLabel: false },
      legend: {
        top: 6, right: 8,
        textStyle: { color: '#f6f9ff', fontSize: 12, fontWeight: 500 },
        itemWidth: 18, itemHeight: 8,
        data: ['MA home price', 'MA income', 'US income']
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: 'rgba(255,255,255,0.25)' } },
        formatter: (params) => {
          const yr = params[0].axisValue;
          const lookup = (name) => params.find(p => p.seriesName === name);
          const p = lookup('MA home price'), i = lookup('MA income'), u = lookup('US income');
          const yrIdx = years.indexOf(Number(yr));
          const ratio = data.series.price_to_income[yrIdx];
          const homeRaw = data.series.ma_home_price[yrIdx];
          const incRaw = data.series.ma_income[yrIdx];
          return `
            <div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#95a0bb;margin-bottom:6px;">${yr}</div>
            <div style="display:grid;grid-template-columns:auto auto;gap:4px 14px;font-size:12.5px">
              <span style="color:#95a0bb">MA home</span><b style="color:#ff1744;font-family:JetBrains Mono,monospace">$${homeRaw ? (homeRaw/1000).toFixed(0)+'K' : '—'}</b>
              <span style="color:#95a0bb">MA income</span><b style="color:#00e676;font-family:JetBrains Mono,monospace">$${incRaw ? (incRaw/1000).toFixed(0)+'K' : '—'}</b>
              <span style="color:#95a0bb">Ratio</span><b style="color:#ffd600;font-family:JetBrains Mono,monospace">${ratio ? ratio.toFixed(2)+'×' : '—'}</b>
            </div>`;
        }
      },
      xAxis: {
        type: 'category',
        data: years,
        axisLabel: { color: '#c8d2e6', fontSize: 11, interval: 2 },
        boundaryGap: false
      },
      yAxis: {
        type: 'value',
        name: 'Index (2000 = 100)',
        nameLocation: 'middle',
        nameGap: 50,
        nameTextStyle: { color: '#95a0bb', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' },
        axisLabel: { color: '#c8d2e6', fontFamily: 'JetBrains Mono, monospace', formatter: '{value}' },
        min: 80,
        max: 360
      },
      series: [
        // base income line (the floor of the wedge)
        {
          name: 'MA income',
          type: 'line',
          stack: 'div',
          data: incomeIdx,
          symbol: 'none',
          smooth: 0.2,
          lineStyle: { width: 3, color: '#00e676', shadowBlur: 14, shadowColor: 'rgba(0,230,118,0.6)' },
          areaStyle: { color: 'transparent' },
          // monetary-regime context bands — visible always
          markArea: {
            silent: true,
            label: {
              color: '#c8d2e6', fontSize: 10, fontWeight: 600,
              fontFamily: 'JetBrains Mono, monospace',
              position: 'insideTop', distance: 6,
              textShadowColor: 'rgba(0,0,0,0.7)', textShadowBlur: 4
            },
            data: [
              [
                {
                  xAxis: '2008', name: 'QE  +  ZIRP',
                  itemStyle: {
                    color: 'rgba(0,184,255,0.07)',
                    borderColor: 'rgba(0,184,255,0.30)',
                    borderWidth: 1
                  },
                  label: { color: '#00b8ff', textShadowColor: 'rgba(0,184,255,0.5)' }
                },
                { xAxis: '2015' }
              ],
              [
                {
                  xAxis: '2020', name: 'ZIRP  +  COVID',
                  itemStyle: {
                    color: 'rgba(255,23,68,0.10)',
                    borderColor: 'rgba(255,23,68,0.35)',
                    borderWidth: 1
                  },
                  label: { color: '#ff1744', textShadowColor: 'rgba(255,23,68,0.5)' }
                },
                { xAxis: '2022' }
              ]
            ]
          },
          z: 4
        },
        // gap series stacked on top → top edge of stack equals MA price line
        {
          name: 'MA home price',
          type: 'line',
          stack: 'div',
          data: gapIdx,
          symbol: 'none',
          smooth: 0.2,
          lineStyle: { width: 3.4, color: '#ff1744', shadowBlur: 18, shadowColor: 'rgba(255,23,68,0.75)' },
          areaStyle: {
            color: {
              type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(255,23,68,0.55)' },
                { offset: 1, color: 'rgba(255,23,68,0.05)' }
              ]
            }
          },
          z: 5
        },
        // US income — context, not stacked
        {
          name: 'US income',
          type: 'line',
          data: usIncomeIdx,
          symbol: 'none',
          smooth: 0.2,
          lineStyle: { width: 2, color: '#00b8ff', type: 'dashed', opacity: 0.95, shadowBlur: 10, shadowColor: 'rgba(0,184,255,0.55)' },
          z: 3
        }
      ],
      graphic: { elements: [] }
    };
  }

  function annotation(coord, label, color, position = 'top', distance = 14) {
    return {
      coord,
      value: label,
      symbolSize: 12,
      itemStyle: { color, borderColor: '#fff', borderWidth: 2, shadowBlur: 14, shadowColor: color + '99' },
      label: {
        formatter: label,
        color, fontSize: 11, fontWeight: 600, fontFamily: 'JetBrains Mono, monospace',
        position, distance,
        backgroundColor: 'rgba(8,14,28,0.85)', padding: [4, 8], borderRadius: 4,
        textShadowColor: color, textShadowBlur: 8
      }
    };
  }

  function applyStep(n) {
    if (!chart) return;
    const { years, priceIdx, incomeIdx } = chart._series;
    // empty graphic[] always; we replaceMerge it on every step so callouts
    // from one step can never bleed into another.
    const opt = { series: [{}, {}, {}], graphic: [] };

    // === markPoints stack onto the visible top line (MA home price = stacked area top) ===
    // Coordinates need to be on the displayed stack value, which is priceIdx itself.
    const markPoints = [];
    const yrToCoord = (yr) => {
      const i = years.indexOf(yr);
      return [String(yr), priceIdx[i]];
    };

    if (n >= 2) {
      markPoints.push(annotation(yrToCoord(2007), '2007 — 6.0×', '#ffd600'));
      markPoints.push(annotation(yrToCoord(2012), '2012 — 4.6×', '#00e676', 'bottom', 16));
    }
    if (n >= 4) {
      markPoints.push(annotation(yrToCoord(2024), '2024 — 5.5×', '#ff1744'));
    }
    opt.series[1] = { markPoint: { symbol: 'circle', data: markPoints } };

    // === step 5: gap callout in cinematic typography ===
    if (n === 5) {
      // dim the gap area so the typography reads cleanly over it
      opt.series[1].areaStyle = {
        color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [
          { offset: 0, color: 'rgba(255,23,68,0.30)' },
          { offset: 1, color: 'rgba(255,23,68,0.03)' }
        ]}
      };
      opt.graphic = [
        { id: 'gap-num', type: 'text', left: 'center', top: '22%',
          style: { text: '$130K', fontFamily: 'Cormorant Garamond, serif', fontWeight: 700, fontStyle: 'italic',
                   fontSize: 96, fill: '#ff1744', textShadowColor: 'rgba(255,23,68,0.85)', textShadowBlur: 28 } },
        { id: 'gap-sub', type: 'text', left: 'center', top: '42%',
          style: { text: 'the gap, per home', fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic',
                   fontSize: 24, fill: '#ffd600', textShadowColor: 'rgba(255,214,0,0.7)', textShadowBlur: 12 } },
        { id: 'gap-cap', type: 'text', left: 'center', top: '50%',
          style: { text: 'between today’s actual MA price and what 2000’s ratio would imply',
                   fontFamily: 'Inter, sans-serif', fontSize: 12, fill: '#d6deef', opacity: 0.92 } }
      ];
    }

    // === step 6: verdict at the bottom — and importantly, NO step-5 callout ===
    if (n >= 6) {
      opt.graphic = [{
        id: 'verdict', type: 'text', left: 'center', bottom: 12,
        style: {
          text: 'Prices grew. Incomes did not keep pace. The wedge between them is the crisis.',
          fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', fontWeight: 600,
          fontSize: 18, fill: '#ffd600', textShadowColor: 'rgba(255,214,0,0.6)', textShadowBlur: 14
        }
      }];
    }

    // replaceMerge: ['graphic'] forces ECharts to fully replace graphic each step,
    // preventing the $130K from bleeding into step 6 (the bug Duncan caught).
    chart.setOption(opt, { replaceMerge: ['graphic'] });
  }

  section.addEventListener('step:enter', (e) => {
    if (e.detail.step) applyStep(e.detail.step);
  });

  const ready = new IntersectionObserver((entries, obs) => {
    if (entries.some(en => en.isIntersecting)) {
      obs.disconnect();
      init().catch(err => {
        console.error('Section 2 init failed:', err);
        chartEl.innerHTML = '<div style="padding:2rem;color:#ff5d7d;font-family:var(--mono);font-size:0.85rem">Chart failed to load: ' + err.message + '</div>';
      });
    }
  }, { rootMargin: '300px 0px' });
  ready.observe(section);
})();
