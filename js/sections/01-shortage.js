// 01-shortage.js — Section 1: Is this a shortage, or something else?
// Sticky chart: MA active for-sale inventory (Zillow), with US state-average baseline.
// As the reader scrolls through steps 1-5, the chart annotates progressively.

(function () {
  'use strict';

  const section = document.getElementById('s1');
  const chartEl = document.getElementById('chart-s1-inventory');
  if (!section || !chartEl) return;

  let chart;
  let baseOption;
  let dataMA, dataUS;

  async function init() {
    chart = echarts.init(chartEl, 'crisis', { renderer: 'canvas' });

    [dataMA, dataUS] = await Promise.all([
      HAC.loadJSON('data/processed/ma-inventory.json'),
      HAC.loadJSON('data/processed/us-inventory.json')
    ]);

    const maPts = dataMA.series.map(p => [p.date, p.value]);
    const usPts = dataUS.series.map(p => [p.date, p.value]);

    // peak / trough callouts on MA
    let peak = maPts[0], trough = maPts[0];
    for (const p of maPts) {
      if (p[1] > peak[1]) peak = p;
      if (p[1] < trough[1]) trough = p;
    }

    baseOption = {
      animation: true,
      animationDuration: 900,
      animationEasing: 'cubicOut',
      grid: { left: 64, right: 28, top: 32, bottom: 48, containLabel: false },
      legend: {
        top: 4, right: 8,
        textStyle: { color: '#b9c1d6', fontSize: 12 },
        itemWidth: 14, itemHeight: 8,
        data: ['Massachusetts', 'US state avg.']
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: 'rgba(255,255,255,0.2)' } },
        formatter: (params) => {
          if (!params || !params.length) return '';
          const date = params[0].axisValueLabel || params[0].axisValue;
          const lines = params.map(p => {
            const val = p.data[1];
            const dot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.color};margin-right:6px;vertical-align:middle"></span>`;
            return `${dot}<b>${p.seriesName}</b> &nbsp; <span style="font-family:JetBrains Mono,monospace">${HAC.fmt.short(val)}</span>`;
          }).join('<br/>');
          return `<div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#7c849e;margin-bottom:6px;">${date}</div>${lines}`;
        }
      },
      xAxis: {
        type: 'time',
        axisLabel: {
          formatter: (val) => new Date(val).toLocaleString('en-US', { month: 'short', year: '2-digit' }),
          fontSize: 11
        },
        boundaryGap: false
      },
      yAxis: {
        type: 'value',
        name: 'Active listings',
        nameLocation: 'middle',
        nameGap: 50,
        nameTextStyle: { color: '#7c849e', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' },
        axisLabel: { formatter: (v) => HAC.fmt.short(v) }
      },
      series: [
        {
          name: 'Massachusetts',
          type: 'line',
          data: maPts,
          smooth: 0.25,
          showSymbol: false,
          lineStyle: { width: 2.6, color: '#ff4d5a', shadowBlur: 12, shadowColor: 'rgba(255,77,90,0.45)' },
          areaStyle: {
            color: {
              type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(255,77,90,0.35)' },
                { offset: 1, color: 'rgba(255,77,90,0)' }
              ]
            }
          },
          emphasis: { focus: 'series' },
          z: 3
        },
        {
          name: 'US state avg.',
          type: 'line',
          data: usPts,
          smooth: 0.25,
          showSymbol: false,
          lineStyle: { width: 1.6, color: '#5cc8ff', type: 'dashed', opacity: 0.85 },
          z: 2
        }
      ],
      // markPoints get attached/detached by step()
      graphic: []
    };

    chart.setOption(baseOption);
    window.addEventListener('resize', () => chart.resize());

    // store callouts for stepwise reveal
    chart._callouts = { peak, trough };
    applyStep(1);
  }

  function applyStep(n) {
    if (!chart) return;
    const { peak, trough } = chart._callouts;
    const opt = { series: [{}, {}], graphic: { elements: [] } };

    // mark points layered onto MA series
    const markPoints = [];
    if (n >= 1) {
      markPoints.push({
        coord: peak, value: HAC.fmt.short(peak[1]),
        symbolSize: 10, itemStyle: { color: '#f3c14b' },
        label: {
          formatter: `Peak: ${HAC.fmt.short(peak[1])}\n${HAC.fmt.monthLabel(peak[0])}`,
          color: '#f3c14b', fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
          position: 'top', distance: 10, lineHeight: 14
        }
      });
    }
    if (n >= 2) {
      markPoints.push({
        coord: trough, value: HAC.fmt.short(trough[1]),
        symbolSize: 10, itemStyle: { color: '#ff4d5a' },
        label: {
          formatter: `Trough: ${HAC.fmt.short(trough[1])}\n${HAC.fmt.monthLabel(trough[0])}`,
          color: '#ff8b94', fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
          position: 'bottom', distance: 14, lineHeight: 14
        }
      });
    }

    opt.series[0] = {
      markPoint: {
        symbol: 'circle',
        data: markPoints,
        animation: true
      }
    };

    // step 3: highlight rate-lock era (post-2022)
    if (n >= 3) {
      opt.series[0].markArea = {
        silent: true,
        itemStyle: { color: 'rgba(243,193,75,0.06)', borderColor: 'rgba(243,193,75,0.18)', borderWidth: 1 },
        data: [[
          { xAxis: '2022-04-01', name: 'Rate-lock era' },
          { xAxis: chart._callouts.trough[0] > '2022-04-01' ? new Date().toISOString().slice(0,10) : '2026-03-31' }
        ]],
        label: {
          color: '#f3c14b',
          fontSize: 11,
          fontFamily: 'JetBrains Mono, monospace',
          position: 'insideTop',
          distance: 8
        }
      };
    } else {
      opt.series[0].markArea = { data: [] };
    }

    // step 5 final: punctuation banner across the whole chart
    if (n >= 5) {
      opt.graphic = {
        elements: [{
          type: 'text',
          left: 'center',
          top: 18,
          style: {
            text: 'Listings collapsed. Units did not. The bottleneck is price, not supply.',
            fontFamily: 'Cormorant Garamond, serif',
            fontStyle: 'italic',
            fontSize: 16,
            fill: '#f3c14b',
            opacity: 0.95
          }
        }]
      };
    } else {
      opt.graphic = { elements: [] };
    }

    chart.setOption(opt);
  }

  // listen for step entries from main.js
  section.addEventListener('step:enter', (e) => {
    const step = e.detail.step;
    if (step) applyStep(step);
  });

  // boot once visible (avoid initial layout flash with 0px height)
  const ready = new IntersectionObserver((entries, obs) => {
    if (entries.some(en => en.isIntersecting)) {
      obs.disconnect();
      init().catch(err => {
        console.error('Section 1 init failed:', err);
        chartEl.innerHTML = '<div style="padding:2rem;color:#ff8b94;font-family:var(--mono);font-size:0.85rem">Chart failed to load: ' + err.message + '</div>';
      });
    }
  }, { rootMargin: '200px 0px' });
  ready.observe(section);
})();
