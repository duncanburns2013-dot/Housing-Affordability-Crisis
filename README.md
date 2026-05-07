# The Massachusetts Affordability Crisis

A data-driven Socratic investigation arguing that Massachusetts faces an *affordability* crisis, not a *housing* crisis — and that government subsidization (especially demand-side rental subsidies) is a primary inflation channel rather than a relief mechanism.

**Live site:** _(deploy via GitHub Pages — Settings → Pages → Branch: `main` / root)_

## Argument structure (six Socratic sections)

1. **Is this a shortage, or something else?** — vacancy, inventory, rate-lock dynamics
2. **If supply is intact, why have prices climbed?** — price-to-income divergence
3. **Is this just rates, COVID, or national?** — MA vs. NH vs. US comparison
4. **Are subsidies relieving or inflating prices?** — CTHRU spending stack + reader-controlled cost-per-recipient slider that derives the implied caseload
5. **What are residents doing about it?** — IRS net migration + AGI outflow
6. **What changes the trajectory?** — verdict + town-level 3D map explorer

Every chart cites its source. Every assumption is exposed and adjustable by the reader.

## Stack

- Static HTML / vanilla JS / CSS (deployed on GitHub Pages)
- [ECharts 5](https://echarts.apache.org/) for charts (and ECharts-GL for the 3D town map)
- [GSAP + ScrollTrigger](https://gsap.com/scroll/) for scroll choreography
- IntersectionObserver for step-by-step chart annotation
- Node.js scripts for data ETL (no Python required)

## Data sources

| Source | What it gives us | Section |
|---|---|---|
| Zillow Research (state, metro, ZIP CSVs) | ZHVI, inventory, sale prices | 1, 2, 3 |
| US Census ACS | median household income, vacancy, units | 1, 2 |
| BLS | wage growth | 2 |
| Federal Reserve / FRED | mortgage rates | 1, 3 |
| IRS SOI | net migration + AGI flow by county | 5 |
| MA CTHRU | actual state expenditures, line-item | 4 |
| MA EOHLC / DHCD | EA family shelter caseload, hotel contracts | 4 |
| HUD | subsidized housing counts | 4 |
| MLSPIN | town-level listings, days on market, price reductions | all |

## Repo layout

```
.
├── index.html                     scrollytelling page
├── css/
│   ├── main.css                   theme, hero, nav, chart frame
│   └── sections.css               sticky-chart scrollytelling layout
├── js/
│   ├── main.js                    progress bar, scroll observers, ECharts theme, helpers
│   └── sections/
│       ├── 01-shortage.js         (built)
│       ├── 02-divergence.js       (next)
│       ├── 03-macro.js            (next)
│       ├── 04-spending.js         (next)
│       ├── 05-outmigration.js     (next)
│       └── 06-conclusion.js       (next)
├── data/
│   ├── raw/                       downloaded CSVs (gitignored if large)
│   └── processed/                 dashboard-ready JSON
├── pipelines/
│   ├── fetch_zillow.sh            refresh raw Zillow CSVs
│   └── process_zillow.js          raw → MA-filtered JSON
└── README.md
```

## Refreshing data

```bash
bash pipelines/fetch_zillow.sh        # pull latest Zillow CSVs
node pipelines/process_zillow.js      # filter to MA, write JSON
```

## Local preview

```bash
npx serve .          # or any static server
# open http://localhost:3000
```

## Methodological commitments

- **No advocacy estimates as primary facts.** Where a figure is contested (e.g., undocumented population), we use only public spending data as the bedrock and let the reader derive caseload via an adjustable cost-per-recipient slider.
- **Every chart links its source.** No "trust me" numbers.
- **Pre-empt counter-arguments.** Each section anticipates the most common objection and shows the data that addresses it.
