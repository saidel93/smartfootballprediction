// netlify/functions/cronHourly.js
// ============================================================
// HOURLY ORCHESTRATOR
// Called every hour by cron-job.org
// URL: https://smartfootballpredictions.com/.netlify/functions/cronHourly
//
// SETUP cron-job.org (FREE):
// 1. Go to cron-job.org → Create Cronjob
// 2. URL: https://smartfootballpredictions.com/.netlify/functions/cronHourly
// 3. Schedule: Every hour (0 * * * *)
// 4. Header: x-cron-secret = [your CRON_SECRET value]
// 5. Save
// ============================================================
const https = require('https');

function callFn(fnName) {
  return new Promise((resolve) => {
    const siteUrl = process.env.URL || 'https://smartfootballpredictions.com';
    const url = `${siteUrl}/.netlify/functions/${fnName}`;
    const opts = { headers: { 'x-cron-secret': process.env.CRON_SECRET || '' } };
    const req = https.get(url, opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(data) }); } catch { resolve({ status: res.statusCode, body: data }); } });
    });
    req.on('error', e => resolve({ status: 500, error: e.message }));
    req.setTimeout(25000, () => { req.destroy(); resolve({ status: 408, error: 'timeout' }); });
  });
}

exports.handler = async (event) => {
  // Security check
  if (process.env.CRON_SECRET && event.headers['x-cron-secret'] !== process.env.CRON_SECRET) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const hour = new Date().getUTCHours();
  const log  = { timestamp: new Date().toISOString(), hour, steps: [] };

  console.log(`cronHourly running at ${log.timestamp}`);

  // Step 1: Fetch fixtures
  try {
    const r = await callFn('fetchFixtures');
    log.steps.push({ step: 'fetchFixtures', status: r.status, inserted: r.body?.inserted, updated: r.body?.updated });
    console.log('fetchFixtures:', r.body?.inserted, 'inserted');
  } catch (e) { log.steps.push({ step: 'fetchFixtures', error: e.message }); }

  await new Promise(r => setTimeout(r, 3000));

  // Step 2: Generate predictions
  try {
    const r = await callFn('generatePrediction');
    log.steps.push({ step: 'generatePrediction', status: r.status, generated: r.body?.generated });
    console.log('generatePrediction:', r.body?.generated, 'generated');
  } catch (e) { log.steps.push({ step: 'generatePrediction', error: e.message }); }

  await new Promise(r => setTimeout(r, 3000));

  // Step 3: Resolve completed predictions
  try {
    const r = await callFn('resolvePredictions');
    log.steps.push({ step: 'resolvePredictions', status: r.status, resolved: r.body?.resolved });
    console.log('resolvePredictions:', r.body?.resolved, 'resolved');
  } catch (e) { log.steps.push({ step: 'resolvePredictions', error: e.message }); }

  // Step 4: Daily blog at 07:00 UTC only
  if (hour === 7) {
    await new Promise(r => setTimeout(r, 3000));
    try {
      const r = await callFn('generateBlog');
      log.steps.push({ step: 'generateBlog', status: r.status, slug: r.body?.slug });
      console.log('generateBlog:', r.body?.slug);
    } catch (e) { log.steps.push({ step: 'generateBlog', error: e.message }); }
  }

  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: true, ...log }) };
};
