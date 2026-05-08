// main.js — global page orchestration
//   - thin progress bar
//   - active dot in side nav
//   - generic step reveal via IntersectionObserver
//   - shared ECharts theme registration

(function () {
  'use strict';

  /* -------- progress bar -------- */
  const progress = document.getElementById('progressBar');
  function updateProgress() {
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    const pct = max > 0 ? (h.scrollTop / max) * 100 : 0;
    progress.style.width = pct.toFixed(2) + '%';
  }
  document.addEventListener('scroll', updateProgress, { passive: true });
  updateProgress();

  /* -------- active section dot -------- */
  const dotLinks = Array.from(document.querySelectorAll('.dot-nav a'));
  const sectionIds = dotLinks.map(a => a.getAttribute('href').slice(1));
  const sections = sectionIds.map(id => document.getElementById(id)).filter(Boolean);
  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const id = e.target.id;
      dotLinks.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + id));
    });
  }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
  sections.forEach(s => sectionObserver.observe(s));

  /* -------- intermission fade-in on scroll -------- */
  const intermissionObserver = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) e.target.classList.add('in-view');
    });
  }, { rootMargin: '-15% 0px -15% 0px', threshold: 0 });
  document.querySelectorAll('.intermission').forEach(s => intermissionObserver.observe(s));

  /* -------- generic step reveal (scrollytelling) -------- */
  const stepObserver = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('is-active');
        // notify section JS so charts can react
        const section = e.target.closest('.story-section');
        const stepNum = Number(e.target.getAttribute('data-step'));
        if (section) {
          section.dispatchEvent(new CustomEvent('step:enter', {
            detail: { step: stepNum, el: e.target }
          }));
        }
      } else {
        e.target.classList.remove('is-active');
      }
    });
  }, { rootMargin: '-40% 0px -40% 0px', threshold: 0 });
  document.querySelectorAll('.step').forEach(s => stepObserver.observe(s));

  /* -------- shared ECharts theme — MA palette, neon on dark -------- */
  if (window.echarts) {
    echarts.registerTheme('crisis', {
      backgroundColor: 'transparent',
      textStyle: {
        color: '#f6f9ff',
        fontFamily: 'Inter, system-ui, sans-serif'
      },
      title: {
        textStyle: { color: '#f6f9ff', fontWeight: 500 },
        subtextStyle: { color: '#d6deef' }
      },
      legend: {
        textStyle: { color: '#d6deef', fontSize: 12 },
        icon: 'roundRect'
      },
      grid: { borderColor: 'rgba(255,255,255,0.10)' },
      categoryAxis: {
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.22)' } },
        axisTick: { lineStyle: { color: 'rgba(255,255,255,0.22)' } },
        axisLabel: { color: '#c8d2e6' },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } }
      },
      valueAxis: {
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#c8d2e6', fontFamily: 'JetBrains Mono, monospace' },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.10)' } }
      },
      tooltip: {
        backgroundColor: 'rgba(8,14,28,0.95)',
        borderColor: 'rgba(0,184,255,0.30)',
        borderWidth: 1,
        textStyle: { color: '#f6f9ff', fontSize: 13 },
        extraCssText: 'backdrop-filter: blur(10px); border-radius: 10px; box-shadow: 0 12px 40px rgba(0,0,0,0.5); padding: 10px 14px;'
      },
      color: ['#ff1744', '#00b8ff', '#00e676', '#ffd600', '#b388ff']
    });
  }

  /* -------- expose helpers -------- */
  window.HAC = window.HAC || {};
  window.HAC.fmt = {
    short: (n) => {
      if (n == null || Number.isNaN(n)) return '—';
      const abs = Math.abs(n);
      if (abs >= 1e9) return (n / 1e9).toFixed(1) + 'B';
      if (abs >= 1e6) return (n / 1e6).toFixed(1) + 'M';
      if (abs >= 1e3) return (n / 1e3).toFixed(1) + 'K';
      return String(Math.round(n));
    },
    pct: (x, digits = 1) => (x == null ? '—' : (x * 100).toFixed(digits) + '%'),
    money: (n) => {
      if (n == null) return '—';
      return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
    },
    monthLabel: (iso) => {
      if (!iso) return '';
      const d = new Date(iso);
      return d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
    }
  };

  // simple JSON loader with cache
  const cache = new Map();
  window.HAC.loadJSON = async function (url) {
    if (cache.has(url)) return cache.get(url);
    const p = fetch(url).then(r => {
      if (!r.ok) throw new Error('failed to load ' + url + ': ' + r.status);
      return r.json();
    });
    cache.set(url, p);
    return p;
  };
})();
