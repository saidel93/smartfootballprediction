// netlify/functions/getMatches.js
const { connectToDatabase } = require('./utils/mongodb');

const H = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: H, body: '' };
  try {
    const { db } = await connectToDatabase();
    const p = event.queryStringParameters || {};
    const days = Math.min(parseInt(p.days) || 7, 30);
    const league = p.league || null;
    const date = p.date || null;
    const now = new Date();
    const cutoff = new Date(now.getTime() + days * 86400000);

    const query = {};
    if (date) {
      const d = new Date(date); const dEnd = new Date(d); dEnd.setDate(dEnd.getDate() + 1);
      query.matchDate = { $gte: d, $lte: dEnd };
    } else {
      query.matchDate = { $gte: now, $lte: cutoff };
    }
    if (league) query.leagueName = decodeURIComponent(league);

    const [fixtures, preds] = await Promise.all([
      db.collection('fixtures').find(query).sort({ matchDate: 1 }).limit(300).toArray(),
      db.collection('predictions').find({}).toArray(),
    ]);

    const pm = {}; preds.forEach(p => { pm[p.fixtureId] = p; });

    const grouped = {};
    fixtures.forEach(f => {
      const key = f.leagueName || 'Other';
      if (!grouped[key]) grouped[key] = { league: key, flag: f.leagueFlag || '⚽', country: f.leagueCountry || '', matches: [] };
      grouped[key].matches.push({ ...f, _id: f._id?.toString(), prediction: pm[f.apiId] ? { ...pm[f.apiId], _id: pm[f.apiId]._id?.toString() } : null });
    });

    return { statusCode: 200, headers: H, body: JSON.stringify({ success: true, total: fixtures.length, grouped: Object.values(grouped) }) };
  } catch (e) {
    console.error('getMatches:', e);
    return { statusCode: 500, headers: H, body: JSON.stringify({ success: false, error: e.message }) };
  }
};
