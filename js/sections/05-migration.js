// 05-migration.js — Section 5: IRS net domestic migration + AGI outflow
// Time-series with dual y-axis: net people (cranberry bars going down)
// and net AGI (vivid blue line overlay). Step 5 swaps to a horizontal
// bar chart of top destination states for the latest year.

(function () {
  'use strict';

  const section = document.getElementById('s5');
  const chartEl = document.getElementById('chart-s5-migration');
  if (!section || !chartEl) return;

  let chart, data;

  async function init() {
    chart = echarts.init(chartEl, 'crisis', { renderer: 'canvas' });
    data = await HAC.loadJSON('data/processed/ma-migration.json');
    chart.setOption(buildTimeSeriesOption());
    window.addEventListener('resize', () => chart.resize());
    applyStep(1);
  }

  function buildTimeSeriesOption() {
    const years = data.years;
    // negative-display people (so net OUT shows as DOWN bars)
    const peopleNet = data.ma_net_people;       // already negative
    const agiNetM   = data.ma_net_agi.map(a => a == null ? null : a / 1000); // $M

    return {
      animation: true,
      animationDuration: 900,
      grid: { left: 78, right: 80, top: 36, bottom: 52, containLabel: false },
      legend: {
        top: 6, right: 100,
        textStyle: { color: '#f6f9ff', fontSize: 12, fontWeight: 500 },
        itemWidth: 16, itemHeight: 8,
        data: ['Net people moved (out is negative)', 'Net AGI moved ($M)']
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: 'rgba(255,255,255,0.25)' } },
        formatter: (params) => {
          const yr = params[0].axisValue;
          const i = years.indexOf(yr);
          const p = data.ma_net_people[i];
          const a = data.ma_net_agi[i];
          const out = data.ma_outflow_people[i];
          const inn = data.ma_inflow_people[i];
          return `
            <div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#95a0bb;margin-bottom:6px;">tax year ${yr}</div>
            <div style="display:grid;grid-template-columns:auto auto;gap:4px 14px;font-size:12.5px">
              <span style="color:#95a0bb">Outflow</span><b style="color:#ff1744;font-family:JetBrains Mono,monospace">${out.toLocaleString()}</b>
              <span style="color:#95a0bb">Inflow</span><b style="color:#00e676;font-family:JetBrains Mono,monospace">${inn.toLocaleString()}</b>
              <span style="color:#95a0bb;margin-top:4px">Net people</span><b style="color:#ff1744;font-family:JetBrains Mono,monospace;margin-top:4px">${p.toLocaleString()}</b>
              <span style="color:#95a0bb">Net AGI</span><b style="color:#ffd600;font-family:JetBrains Mono,monospace">$${(a/1000).toFixed(1)}B</b>
            </div>`;
        }
      },
      xAxis: {
        type: 'category',
        data: years,
        axisLabel: { color: '#c8d2e6', fontSize: 12 },
        boundaryGap: true
      },
      yAxis: [
        {
          type: 'value',
          name: 'Net people',
          nameLocation: 'middle',
          nameGap: 60,
          nameTextStyle: { color: '#95a0bb', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' },
          axisLabel: {
            color: '#c8d2e6', fontFamily: 'JetBrains Mono, monospace',
            formatter: (v) => (v / 1000).toFixed(0) + 'K'
          },
          splitLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } }
        },
        {
          type: 'value',
          name: 'Net AGI ($M)',
          nameLocation: 'middle',
          nameGap: 60,
          nameTextStyle: { color: '#95a0bb', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' },
          axisLabel: {
            color: '#c8d2e6', fontFamily: 'JetBrains Mono, monospace',
            formatter: (v) => '$' + (v / 1000).toFixed(1) + 'B'
          },
          splitLine: { show: false }
        }
      ],
      series: [
        {
          name: 'Net people moved (out is negative)',
          type: 'bar',
          yAxisIndex: 0,
          data: peopleNet,
          itemStyle: {
            color: (params) => params.value < 0 ? '#ff1744' : '#00e676',
            shadowBlur: 14,
            shadowColor: 'rgba(255,23,68,0.6)'
          },
          barWidth: '46%',
          emphasis: { focus: 'series' }
        },
        {
          name: 'Net AGI moved ($M)',
          type: 'line',
          yAxisIndex: 1,
          data: agiNetM,
          smooth: 0.25,
          symbol: 'circle',
          symbolSize: 12,
          itemStyle: { color: '#ffd600', borderColor: '#fff', borderWidth: 2, shadowBlur: 16, shadowColor: 'rgba(255,214,0,0.7)' },
          lineStyle: { width: 3, color: '#ffd600', shadowBlur: 14, shadowColor: 'rgba(255,214,0,0.6)' },
          z: 5
        }
      ],
      graphic: []
    };
  }

  function buildDestinationOption() {
    const latest = data.years[data.years.length - 1];
    // top 8 net OUTFLOW destinations (most-negative net), exclude "Foreign"
    const top = (data.top_destinations[latest] || [])
      .filter(d => d.state !== 'FR' && d.name !== 'Foreign')
      .slice(0, 8);

    return {
      animation: true,
      animationDuration: 1100,
      grid: { left: 140, right: 100, top: 50, bottom: 30 },
      tooltip: {
        trigger: 'item',
        formatter: (p) => {
          const f = top[p.dataIndex];
          return `<div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#95a0bb;margin-bottom:6px;">${f.name}</div>
            <div style="font-size:12.5px;line-height:1.7">
              <div>Out: <b style="color:#ff1744;font-family:JetBrains Mono,monospace">${f.out_people.toLocaleString()}</b> people · <b style="color:#ff1744;font-family:JetBrains Mono,monospace">$${(f.out_agi/1000).toFixed(0)}M</b></div>
              <div>In: <b style="color:#00e676;font-family:JetBrains Mono,monospace">${f.in_people.toLocaleString()}</b> people · <b style="color:#00e676;font-family:JetBrains Mono,monospace">$${(f.in_agi/1000).toFixed(0)}M</b></div>
              <div style="margin-top:4px;border-top:1px solid rgba(255,255,255,0.10);padding-top:4px">
                Net: <b style="color:#ffd600;font-family:JetBrains Mono,monospace">${f.net_people.toLocaleString()}</b> people · <b style="color:#ffd600;font-family:JetBrains Mono,monospace">$${(f.net_agi/1000).toFixed(0)}M</b>
              </div>
            </div>`;
        }
      },
      title: {
        text: 'Top destinations of MA outflow — tax year ' + latest,
        left: 'center', top: 6,
        textStyle: { color: '#f6f9ff', fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', fontSize: 18, fontWeight: 500 }
      },
      xAxis: {
        type: 'value',
        inverse: true,           // negative-net = OUT, draws right→left
        axisLabel: {
          color: '#c8d2e6', fontFamily: 'JetBrains Mono, monospace',
          formatter: (v) => (v / 1000).toFixed(0) + 'K'
        },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } }
      },
      yAxis: {
        type: 'category',
        data: top.map(d => d.name),
        axisLabel: { color: '#f6f9ff', fontSize: 13 }
      },
      series: [{
        name: 'Net people lost',
        type: 'bar',
        data: top.map(d => d.net_people),    // negative
        itemStyle: {
          color: '#ff1744', shadowBlur: 16, shadowColor: 'rgba(255,23,68,0.55)',
          borderRadius: [0, 4, 4, 0]
        },
        barWidth: '60%',
        label: {
          show: true, position: 'right',
          formatter: (p) => {
            const f = top[p.dataIndex];
            return `${f.net_people.toLocaleString()}  ·  $${(f.net_agi/1000).toFixed(0)}M`;
          },
          color: '#ffd600', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 600
        }
      }]
    };
  }

  function applyStep(n) {
    if (!chart) return;
    if (n === 5) {
      // swap to destinations chart on the climactic step
      chart.setOption(buildDestinationOption(), { notMerge: true });
    } else if (n === 6) {
      // verdict: dim the time series, overlay text
      chart.setOption(buildTimeSeriesOption(), { notMerge: true });
      chart.setOption({
        graphic: [{
          id: 's5-verdict', type: 'text', left: 'center', bottom: 14,
          style: {
            text: 'People are voting with their feet. The data is unambiguous.',
            fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic', fontWeight: 600,
            fontSize: 18, fill: '#ffd600',
            textShadowColor: 'rgba(255,214,0,0.6)', textShadowBlur: 14
          }
        }]
      }, { replaceMerge: ['graphic'] });
    } else {
      chart.setOption(buildTimeSeriesOption(), { notMerge: true });
      // step-specific annotations on the time series
      const opt = { graphic: [], series: [{}, {}] };
      const years = data.years;
      const peopleNet = data.ma_net_people;
      const yrToCoord = (yr) => [yr, peopleNet[years.indexOf(yr)]];

      const marks = [];
      if (n >= 1) {
        const yr = '2018';
        marks.push({
          coord: yrToCoord(yr),
          symbolSize: 12,
          itemStyle: { color: '#ff1744', borderColor: '#fff', borderWidth: 2, shadowBlur: 12, shadowColor: '#ff1744aa' },
          label: {
            formatter: '2018  -27K  -$1.5B',
            color: '#ff5d7d', fontSize: 11, fontWeight: 600, fontFamily: 'JetBrains Mono, monospace',
            position: 'bottom', distance: 14,
            backgroundColor: 'rgba(8,14,28,0.85)', padding: [4, 8], borderRadius: 4
          }
        });
      }
      if (n >= 2) {
        marks.push({
          coord: yrToCoord('2021'),
          symbolSize: 14,
          itemStyle: { color: '#ff1744', borderColor: '#fff', borderWidth: 2, shadowBlur: 14, shadowColor: '#ff1744cc' },
          label: {
            formatter: '2021  -44K  -$4.3B',
            color: '#ff1744', fontSize: 11, fontWeight: 600, fontFamily: 'JetBrains Mono, monospace',
            position: 'bottom', distance: 14,
            backgroundColor: 'rgba(8,14,28,0.85)', padding: [4, 8], borderRadius: 4
          }
        });
      }
      if (n >= 3) {
        marks.push({
          coord: yrToCoord('2023'),
          symbolSize: 12,
          itemStyle: { color: '#ffd600', borderColor: '#fff', borderWidth: 2, shadowBlur: 12, shadowColor: '#ffd600aa' },
          label: {
            formatter: '2023  -28K  -$4.0B',
            color: '#ffd600', fontSize: 11, fontWeight: 600, fontFamily: 'JetBrains Mono, monospace',
            position: 'bottom', distance: 14,
            backgroundColor: 'rgba(8,14,28,0.85)', padding: [4, 8], borderRadius: 4
          }
        });
      }
      opt.series[0] = { markPoint: { symbol: 'circle', data: marks } };

      if (n === 4) {
        // Dim the bars + AGI line so the typographic moment reads cleanly.
        // Without this the cranberry "$140K" text rendered directly on top of
        // the cranberry bars and was unreadable.
        opt.series[0] = {
          ...opt.series[0],
          itemStyle: {
            color: 'rgba(232, 66, 90, 0.20)',
            shadowBlur: 0
          }
        };
        opt.series[1] = {
          ...opt.series[1],
          lineStyle: { width: 1.4, color: 'rgba(232, 184, 51, 0.30)', shadowBlur: 0 },
          itemStyle: { color: 'rgba(232, 184, 51, 0.40)', borderColor: 'rgba(243,238,222,0.4)', borderWidth: 1, shadowBlur: 0 }
        };
        // Big number now in cream-paper (white) for max contrast against any
        // residual red. Subtitle in gold. Dark shadow halo for separation.
        opt.graphic = [{
          id: 's5-perleaver', type: 'text', left: 'center', top: '28%',
          style: {
            text: '$140,000 per leaver',
            fontFamily: 'Cormorant Garamond, serif', fontWeight: 700, fontStyle: 'italic',
            fontSize: 78, fill: '#f3eede',
            textShadowColor: 'rgba(0, 0, 0, 0.85)', textShadowBlur: 18
          }
        }, {
          id: 's5-perleaver-sub', type: 'text', left: 'center', top: '46%',
          style: {
            text: 'average AGI of every net outmigrant — vs. $114K MA median household income',
            fontFamily: 'Cormorant Garamond, serif', fontStyle: 'italic',
            fontSize: 18, fill: '#e8b833',
            textShadowColor: 'rgba(0, 0, 0, 0.85)', textShadowBlur: 14
          }
        }];
        // Hide the markers on this step so they don't clutter the typography
        opt.series[0].markPoint = { data: [] };
      }

      chart.setOption(opt, { replaceMerge: ['graphic'] });
    }
  }

  section.addEventListener('step:enter', (e) => {
    if (e.detail.step) applyStep(e.detail.step);
  });

  const ready = new IntersectionObserver((entries, obs) => {
    if (entries.some(en => en.isIntersecting)) {
      obs.disconnect();
      init().catch(err => {
        console.error('Section 5 init failed:', err);
        chartEl.innerHTML = '<div style="padding:2rem;color:#ff5d7d;font-family:var(--mono);font-size:0.85rem">Chart failed to load: ' + err.message + '</div>';
      });
    }
  }, { rootMargin: '300px 0px' });
  ready.observe(section);
})();
