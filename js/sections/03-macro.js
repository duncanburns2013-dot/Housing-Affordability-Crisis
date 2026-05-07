// 03-macro.js — Section 3: MA vs NH vs US price-to-income
// Three lines on a single ratio axis, MA premium-over-NH visible as a
// cranberry-tinted wedge. QE + COVID era bands annotate monetary regimes.
// Horizontal gold reference at 3.0× shows the historical affordability norm.

(function () {
  'use strict';

  const section = document.getElementById('s3');
  const chartEl = document.getElementById('chart-s3-states');
  if (!section || !chartEl) return;

  let chart, data;

  async function init() {
    chart = echarts.init(chartEl, 'crisis', { renderer: 'canvas' });
    data = await HAC.loadJSON('data/processed/income-divergence.json');

    const years = data.years.map(String);
    const ma = data.series.ma_price_to_income;
    const nh = data.series.nh_price_to_income;
    const us = data.series.us_price_to_income;
    // gap between MA and NH for the stacked-area wedge
    const gap = ma.map((v, i) => (v != null && nh[i] != null) ? +(v - nh[i]).toFixed(2) : null);

    chart._series = { years, ma, nh, us, gap };
    chart.setOption(buildOption());
    window.addEventListener('resize', () => chart.resize());
    applyStep(1);
  }

  function buildOption() {
    const { years, ma, nh, us, gap } = chart._series;
    return {
      animation: true,
      animationDuration: 900,
      grid: { left: 64, right: 28, top: 36, bottom: 52, containLabel: false },
      legend: {
        top: 6, right: 8,
        textStyle: { color: '#f6f9ff', fontSize: 12, fontWeight: 500 },
        itemWidth: 18, itemHeight: 8,
        data: ['Massachusetts', 'New Hampshire', 'US average']
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: 'rgba(255,255,255,0.25)' } },
        formatter: (params) => {
          const yr = params[0].axisValue;
          const yrIdx = years.indexOf(yr);
          const m = ma[yrIdx], n = nh[yrIdx], u = us[yrIdx];
          const premium = (m != null && n != null) ? '+' + (m - n).toFixed(2) + '×' : '—';
          return `
            <div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#95a0bb;margin-bottom:6px;">${yr}</div>
            <div style="display:grid;grid-template-columns:auto auto;gap:4px 14px;font-size:12.5px">
              <span style="color:#95a0bb">Massachusetts</span><b style="color:#ff1744;font-family:JetBrains Mono,monospace">${m != null ? m.toFixed(2)+'×' : '—'}</b>
              <span style="color:#95a0bb">New Hampshire</span><b style="color:#00e676;font-family:JetBrains Mono,monospace">${n != null ? n.toFixed(2)+'×' : '—'}</b>
              <span style="color:#95a0bb">US average</span><b style="color:#00b8ff;font-family:JetBrains Mono,monospace">${u != null ? u.toFixed(2)+'×' : '—'}</b>
              <span style="color:#95a0bb;margin-top:4px">MA &minus; NH</span><b style="color:#ffd600;font-family:JetBrains Mono,monospace;margin-top:4px">${premium}</b>
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
        name: 'Price ÷ Income',
        nameLocation: 'middle',
        nameGap: 50,
        nameTextStyle: { color: '#95a0bb', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' },
        axisLabel: { color: '#c8d2e6', fontFamily: 'JetBrains Mono, monospace', formatter: (v) => v.toFixed(1) + '×' },
        min: 2,
        max: 7
      },
      series: [
        // monetary-regime context bands attached to first series
        {
          name: 'NH baseline (hidden line for stack)',
          type: 'line',
          stack: 'gap',
          data: nh,
          symbol: 'none',
          lineStyle: { width: 0 },
          areaStyle: { color: 'transparent' },
          showInLegend: false,
          legendHoverLink: false,
          z: 2,
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
                { xAxis: '2008', name: 'QE  +  ZIRP',
                  itemStyle: { color: 'rgba(0,184,255,0.06)', borderColor: 'rgba(0,184,255,0.30)', borderWidth: 1 },
                  label: { color: '#00b8ff', textShadowColor: 'rgba(0,184,255,0.5)' } },
                { xAxis: '2015' }
              ],
              [
                { xAxis: '2020', name: 'ZIRP  +  COVID',
                  itemStyle: { color: 'rgba(255,23,68,0.10)', borderColor: 'rgba(255,23,68,0.35)', borderWidth: 1 },
                  label: { color: '#ff1744', textShadowColor: 'rgba(255,23,68,0.5)' } },
                { xAxis: '2022' }
              ]
            ]
          },
          // 3.0x affordability reference line
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { color: '#ffd600', type: 'dashed', width: 1.4, opacity: 0.7 },
            data: [{
              yAxis: 3.0,
              label: {
                formatter: '3.0×  historical affordability norm',
                color: '#ffd600', fontSize: 11, fontWeight: 600, fontFamily: 'JetBrains Mono, monospace',
                position: 'insideEndTop', distance: 4,
                textShadowColor: 'rgba(255,214,0,0.6)', textShadowBlur: 8,
                backgroundColor: 'rgba(8,14,28,0.7)', padding: [3, 6], borderRadius: 3
              }
            }]
          }
        },
        // The MA-NH gap, stacked on NH → top edge = MA line, fill = the wedge
        {
          name: 'Massachusetts',
          type: 'line',
          stack: 'gap',
          data: chart._series.gap,
          symbol: 'none',
          smooth: 0.2,
          lineStyle: { width: 3.4, color: '#ff1744', shadowBlur: 18, shadowColor: 'rgba(255,23,68,0.75)' },
          areaStyle: {
            color: {
              type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(255,23,68,0.45)' },
                { offset: 1, color: 'rgba(255,23,68,0.05)' }
              ]
            }
          },
          z: 5
        },
        // NH as its own visible line — drawn over the wedge bottom
        {
          name: 'New Hampshire',
          type: 'line',
          data: nh,
          symbol: 'none',
          smooth: 0.2,
          lineStyle: { width: 3, color: '#00e676', shadowBlur: 14, shadowColor: 'rgba(0,230,118,0.7)' },
          z: 6
        },
        // US average — dashed, on top so it's visible inside the wedge
        {
          name: 'US average',
          type: 'line',
          data: us,
          symbol: 'none',
          smooth: 0.2,
          lineStyle: { width: 2.2, color: '#00b8ff', type: 'dashed', opacity: 0.95, shadowBlur: 10, shadowColor: 'rgba(0,184,255,0.55)' },
          z: 7
        }
      ],
      graphic: []
    };
  }

  function annotation(coord, label, color, position = 'top', distance = 14) {
    return {
      coord,
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
    const { years, ma, nh } = chart._series;
    const yrIdx = (yr) => years.indexOf(String(yr));

    const opt = { series: [{}, {}, {}, {}], graphic: [] };
    const maMarks = [], nhMarks = [];

    if (n >= 2) {
      // Mark 2000 baseline gap
      maMarks.push(annotation(['2000', ma[yrIdx(2000)]], '2000  4.42×  MA', '#ff1744'));
      nhMarks.push(annotation(['2000', nh[yrIdx(2000)]], '2000  2.74×  NH', '#00e676', 'bottom', 16));
    }
    if (n >= 3) {
      // 2007 bubble peak — show all three rising
      maMarks.push(annotation(['2007', ma[yrIdx(2007)]], '2007 peak  6.05×', '#ff1744'));
    }
    if (n >= 5) {
      // 2024 current state
      maMarks.push(annotation(['2024', ma[yrIdx(2024)]], '2024  5.53×', '#ff1744'));
      nhMarks.push(annotation(['2024', nh[yrIdx(2024)]], '2024  4.28×', '#00e676', 'bottom', 16));
    }

    // markPoint sits on the visible MA line (stacked series index 1)
    opt.series[1] = { markPoint: { symbol: 'circle', data: maMarks } };
    opt.series[2] = { markPoint: { symbol: 'circle', data: nhMarks } };

    if (n === 5) {
      // cinematic moment: the persistent MA premium
      opt.graphic = [
        { id: 's3-num', type: 'text', left: 'center', top: '20%',
          style: { text: '+1.25×', fontFamily: 'Cormorant Garamond, serif', fontWeight: 700, fontStyle: 'italic',
                   fontSize: 96, fill: '#ff1744', textShadowColor: 'rgba(255,23,68,0.85)', textShadowBlur: 28 } },
        { id: 's3-sub', type: 'text', left: 'center', top: '40%',
          style: { text: 'the MA premium over NH', fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic',
                   fontSize: 24, fill: '#ffd600', textShadowColor: 'rgba(255,214,0,0.7)', textShadowBlur: 12 } },
        { id: 's3-cap', type: 'text', left: 'center', top: '48%',
          style: { text: '~14 additional months of income, per home, just for crossing the state line',
                   fontFamily: 'Inter, sans-serif', fontSize: 12, fill: '#d6deef', opacity: 0.92 } }
      ];
    } else if (n >= 6) {
      opt.graphic = [{
        id: 's3-verdict', type: 'text', left: 'center', bottom: 12,
        style: {
          text: 'Same Fed. Same COVID. Different state line. Different price.',
          fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', fontWeight: 600,
          fontSize: 18, fill: '#ffd600', textShadowColor: 'rgba(255,214,0,0.6)', textShadowBlur: 14
        }
      }];
    }

    chart.setOption(opt, { replaceMerge: ['graphic'] });
  }

  section.addEventListener('step:enter', (e) => {
    if (e.detail.step) applyStep(e.detail.step);
  });

  const ready = new IntersectionObserver((entries, obs) => {
    if (entries.some(en => en.isIntersecting)) {
      obs.disconnect();
      init().catch(err => {
        console.error('Section 3 init failed:', err);
        chartEl.innerHTML = '<div style="padding:2rem;color:#ff5d7d;font-family:var(--mono);font-size:0.85rem">Chart failed to load: ' + err.message + '</div>';
      });
    }
  }, { rootMargin: '300px 0px' });
  ready.observe(section);
})();
