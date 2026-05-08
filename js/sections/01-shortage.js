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
        textStyle: { color: '#f6f9ff', fontSize: 12, fontWeight: 500 },
        itemWidth: 16, itemHeight: 8,
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
          lineStyle: { width: 3.2, color: '#ff1744', shadowBlur: 18, shadowColor: 'rgba(255,23,68,0.7)' },
          areaStyle: {
            color: {
              type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(255,23,68,0.45)' },
                { offset: 1, color: 'rgba(255,23,68,0)' }
              ]
            }
          },
          emphasis: { focus: 'series', lineStyle: { width: 4 } },
          z: 3
        },
        {
          name: 'US state avg.',
          type: 'line',
          data: usPts,
          smooth: 0.25,
          showSymbol: false,
          lineStyle: { width: 2, color: '#00b8ff', type: 'dashed', opacity: 0.95, shadowBlur: 10, shadowColor: 'rgba(0,184,255,0.5)' },
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
    const opt = { series: [{}, {}], graphic: [] };

    // Steps 1–4: build callouts on the chart.
    // Steps 5 & 6: clear callouts and let typography carry the moment.
    const showCallouts = n <= 4;
    const markPoints = [];

    if (showCallouts && n >= 1) {
      markPoints.push({
        coord: peak,
        symbolSize: 12, itemStyle: { color: '#ffd600', borderColor: '#fff', borderWidth: 2, shadowBlur: 16, shadowColor: 'rgba(255,214,0,0.7)' },
        label: {
          formatter: `Peak ${HAC.fmt.short(peak[1])}  ·  ${HAC.fmt.monthLabel(peak[0])}`,
          color: '#ffd600', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600,
          position: 'top', distance: 14,
          textShadowColor: 'rgba(255,214,0,0.6)', textShadowBlur: 10,
          backgroundColor: 'rgba(8,14,28,0.85)', padding: [4, 8], borderRadius: 4
        }
      });
    }
    if (showCallouts && n >= 2) {
      markPoints.push({
        coord: trough,
        symbolSize: 12, itemStyle: { color: '#ff1744', borderColor: '#fff', borderWidth: 2, shadowBlur: 16, shadowColor: 'rgba(255,23,68,0.7)' },
        label: {
          formatter: `Trough ${HAC.fmt.short(trough[1])}  ·  ${HAC.fmt.monthLabel(trough[0])}`,
          color: '#ff5d7d', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600,
          position: 'bottom', distance: 16,
          textShadowColor: 'rgba(255,23,68,0.6)', textShadowBlur: 10,
          backgroundColor: 'rgba(8,14,28,0.85)', padding: [4, 8], borderRadius: 4
        }
      });
    }

    opt.series[0] = { markPoint: { symbol: 'circle', data: markPoints, animation: true } };

    // Step 3-4: highlight rate-lock era (post-2022) — bright vivid blue, not muted
    if (showCallouts && n >= 3) {
      opt.series[0].markArea = {
        silent: true,
        itemStyle: { color: 'rgba(0,184,255,0.10)', borderColor: 'rgba(0,184,255,0.45)', borderWidth: 1 },
        data: [[ { xAxis: '2022-04-01', name: 'Rate-lock era' }, { xAxis: '2026-03-31' } ]],
        label: {
          color: '#00b8ff', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600,
          position: 'insideTop', distance: 8,
          textShadowColor: 'rgba(0,184,255,0.6)', textShadowBlur: 10
        }
      };
    } else {
      opt.series[0].markArea = { data: [] };
    }

    // Step 5: dim the data, foreground a giant typographic "22 days"
    if (n === 5) {
      opt.series[0].lineStyle = { width: 2.4, color: 'rgba(255,23,68,0.45)' };
      opt.series[0].areaStyle = { color: 'rgba(255,23,68,0.08)' };
      opt.series[1].lineStyle = { width: 1.6, color: 'rgba(0,184,255,0.35)', type: 'dashed' };
      opt.graphic = [
        { id: 's1-22',     type: 'text', left: 'center', top: '32%',
          style: { text: '22', fontFamily: 'Cormorant Garamond, serif', fontWeight: 700, fontStyle: 'italic',
                   fontSize: 140, fill: '#ff1744', textShadowColor: 'rgba(255,23,68,0.85)', textShadowBlur: 28 } },
        { id: 's1-days',   type: 'text', left: 'center', top: '60%',
          style: { text: 'days', fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic',
                   fontSize: 32, fill: '#ffd600', textShadowColor: 'rgba(255,214,0,0.7)', textShadowBlur: 14 } },
        { id: 's1-cap',    type: 'text', left: 'center', top: '74%',
          style: { text: 'median time, list to sale — Massachusetts, last 12 months',
                   fontFamily: 'Inter, sans-serif', fontSize: 13, fill: '#d6deef', opacity: 0.92 } }
      ];
    } else if (n >= 6) {
      // Step 6: data returns at full intensity; verdict displayed as glowing italic
      opt.series[0].lineStyle = { width: 3.2, color: '#ff1744', shadowBlur: 18, shadowColor: 'rgba(255,23,68,0.7)' };
      opt.series[0].areaStyle = {
        color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [{ offset: 0, color: 'rgba(255,23,68,0.45)' }, { offset: 1, color: 'rgba(255,23,68,0)' }] }
      };
      opt.series[1].lineStyle = { width: 2, color: '#00b8ff', type: 'dashed', opacity: 0.95, shadowBlur: 10, shadowColor: 'rgba(0,184,255,0.5)' };
      opt.graphic = [{
        id: 's1-verdict', type: 'text', left: 'center', bottom: 12,
        style: {
          text: 'Listings collapsed.   Units did not.   The bottleneck is price, not supply.',
          fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', fontWeight: 600,
          fontSize: 18, fill: '#ffd600', textShadowColor: 'rgba(255,214,0,0.6)', textShadowBlur: 14
        }
      }];
    } else {
      // restore full-intensity styling for steps 1-4
      opt.series[0].lineStyle = { width: 3.2, color: '#ff1744', shadowBlur: 18, shadowColor: 'rgba(255,23,68,0.7)' };
      opt.series[0].areaStyle = {
        color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [{ offset: 0, color: 'rgba(255,23,68,0.45)' }, { offset: 1, color: 'rgba(255,23,68,0)' }] }
      };
      opt.series[1].lineStyle = { width: 2, color: '#00b8ff', type: 'dashed', opacity: 0.95, shadowBlur: 10, shadowColor: 'rgba(0,184,255,0.5)' };
      opt.graphic = [];
    }

    // replaceMerge forces ECharts to drop any prior step's graphic elements
    // (otherwise leftover '22' / 'days' nodes bleed into other steps).
    chart.setOption(opt, { replaceMerge: ['graphic'] });
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
