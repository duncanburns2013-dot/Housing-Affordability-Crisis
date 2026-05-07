// probe_bridge.js — fast smoke test: confirm token + dataset slug work,
// and report a few stats. Safe to commit (it reads token from .env, never prints it).

const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');

const ROOT = path.join(__dirname, '..');

function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) { console.error('no .env'); process.exit(1); }
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

function get(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', e => resolve({ status: 0, body: e.message }));
  });
}

(async () => {
  const env = loadEnv();
  const token = env.BRIDGE_TOKEN;
  if (!token || token.startsWith('PASTE_')) { console.error('token not set'); process.exit(1); }

  // Try a few likely dataset slugs for MLS PIN (Massachusetts).
  const candidates = [env.BRIDGE_DATASET, 'mlspin', 'mlspn', 'mlsma', 'mapin', 'actris', 'test'].filter(Boolean);
  const seen = new Set();
  console.log('Probing dataset slugs (token redacted)...\n');

  for (const slug of candidates) {
    if (seen.has(slug)) continue;
    seen.add(slug);
    const u = new URL(`https://api.bridgedataoutput.com/api/v2/OData/${slug}/Property`);
    u.searchParams.set('access_token', token);
    u.searchParams.set('$top', '1');
    u.searchParams.set('$select', 'ListingKey,City,StateOrProvince,StandardStatus');
    const r = await get(u.toString());
    let note = '';
    try {
      const j = JSON.parse(r.body);
      if (j.value) note = `OK — ${j.value.length} rec sampled`;
      else if (j.error) note = `error: ${j.error.message || JSON.stringify(j.error)}`;
      else note = JSON.stringify(j).slice(0, 200);
    } catch { note = r.body.slice(0, 200); }
    console.log(`  ${slug.padEnd(10)}  HTTP ${r.status}  ${note}`);
  }

  // also try datasets discovery endpoints (Bridge sometimes exposes /datasets)
  const discovery = [
    `https://api.bridgedataoutput.com/api/v2/OData/datasets?access_token=${token}`,
    `https://api.bridgedataoutput.com/api/v2/datasets?access_token=${token}`
  ];
  console.log('\nDiscovery endpoints:');
  for (const url of discovery) {
    const r = await get(url);
    console.log(`  ${url.replace(token, '***')}  HTTP ${r.status}  ${r.body.slice(0, 240).replace(/\s+/g,' ')}`);
  }
})();
