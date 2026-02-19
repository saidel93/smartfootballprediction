// netlify/functions/fetchFixtures.js
// ============================================================
// FETCH FIXTURES FROM FOOTBALL API
// ============================================================
// This function is called by your cron job (cron-job.org)
// every hour at the URL:
//   https://smartfootballpredictions.com/.netlify/functions/fetchFixtures
//
// WHAT IT DOES:
// 1. Calls the Football API to get upcoming fixtures (next 7 days)
// 2. For each fixture, checks if it already exists in MongoDB
// 3. If NEW → inserts it
// 4. If EXISTS but CHANGED (score/status updated) → updates it
// 5. Returns a summary of what was fetched/saved
//
// SUPPORTED FOOTBALL API: api-football.com (via RapidAPI)
// ============================================================

const { connectToDatabase } = require('./utils/mongodb');
const https = require('https');

// ── Helper: make an HTTPS GET request ─────────────────────────
function apiGet(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Failed to parse API response')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

// ── The 15 leagues we cover ────────────────────────────────────
const LEAGUE_IDS = [
  { id: 39,  name: 'Premier League',    country: 'England',  flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { id: 140, name: 'La Liga',           country: 'Spain',    flag: '🇪🇸' },
  { id: 135, name: 'Serie A',           country: 'Italy',    flag: '🇮🇹' },
  { id: 78,  name: 'Bundesliga',        country: 'Germany',  flag: '🇩🇪' },
  { id: 61,  name: 'Ligue 1',           country: 'France',   flag: '🇫🇷' },
  { id: 2,   name: 'Champions League',  country: 'Europe',   flag: '🇪🇺' },
  { id: 94,  name: 'Primeira Liga',     country: 'Portugal', flag: '🇵🇹' },
  { id: 71,  name: 'Brasileirão A',     country: 'Brazil',   flag: '🇧🇷' },
  { id: 72,  name: 'Brasileirão B',     country: 'Brazil',   flag: '🇧🇷' },
  { id: 40,  name: 'Championship',      country: 'England',  flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { id: 41,  name: 'League One',        country: 'England',  flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { id: 65,  name: 'Ligue 2',           country: 'France',   flag: '🇫🇷' },
  { id: 136, name: 'Serie B',           country: 'Italy',    flag: '🇮🇹' },
  { id: 79,  name: '2. Bundesliga',     country: 'Germany',  flag: '🇩🇪' },
  { id: 88,  name: 'Eredivisie',        country: 'Netherlands', flag: '🇳🇱' },
];

// ── Helper: get date string YYYY-MM-DD ─────────────────────────
function dateStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
}

// ── Helper: create URL slug from team names ────────────────────
function createSlug(home, away, date) {
  const clean = str => str.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
  return `${clean(home)}-vs-${clean(away)}-${date}`;
}

// ── Main handler ───────────────────────────────────────────────
exports.handler = async (event, context) => {
  // Allow CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, body: '' };
  }

  // Security: only allow GET requests with optional secret token
  const secret = event.headers['x-cron-secret'];
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const API_KEY = process.env.FOOTBALL_API_KEY;
  if (!API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'FOOTBALL_API_KEY not set in Netlify environment variables' })
    };
  }

  try {
    const { db } = await connectToDatabase();
    const fixturesCollection = db.collection('fixtures');

    // Create unique index to prevent duplicates (run once, harmless if exists)
    await fixturesCollection.createIndex({ apiId: 1 }, { unique: true });

    let inserted = 0;
    let updated  = 0;
    let errors   = [];

    // Fetch fixtures for next 7 days for each league
    for (const league of LEAGUE_IDS) {
      try {
        const from = dateStr(0);  // today
        const to   = dateStr(7);  // 7 days ahead

        const url = `https://v3.football.api-sports.io/fixtures?league=${league.id}&season=2025&from=${from}&to=${to}`;

        // ── THIS IS WHERE THE FOOTBALL API IS CALLED ──────────
        // process.env.FOOTBALL_API_KEY is your API key from
        // api-football.com, stored safely in Netlify env vars.
        // It NEVER appears in your frontend code.
        const response = await apiGet(url, {
          'x-apisports-key': API_KEY,
          'x-rapidapi-host': 'v3.football.api-sports.io'
        });

        if (!response.response) continue;

        for (const fixture of response.response) {
          const f = fixture.fixture;
          const teams = fixture.teams;
          const goals = fixture.goals;
          const score = fixture.score;

          const doc = {
            apiId:      f.id,
            league:     league.id,
            leagueName: league.name,
            leagueCountry: league.country,
            leagueFlag: league.flag,
            homeTeam:   teams.home.name,
            homeTeamId: teams.home.id,
            awayTeam:   teams.away.name,
            awayTeamId: teams.away.id,
            matchDate:  new Date(f.date),
            status:     f.status.short,   // NS, 1H, HT, 2H, FT, etc.
            statusLong: f.status.long,
            goalsHome:  goals.home,
            goalsAway:  goals.away,
            slug:       createSlug(teams.home.name, teams.away.name, f.date.split('T')[0]),
            updatedAt:  new Date(),
          };

          try {
            // upsert: insert if new, update if exists
            const result = await fixturesCollection.updateOne(
              { apiId: f.id },
              { $set: doc },
              { upsert: true }
            );

            if (result.upsertedCount > 0) inserted++;
            else if (result.modifiedCount > 0) updated++;

          } catch (dupError) {
            // Ignore duplicate key errors (race condition)
          }
        }

        // Rate limit: Football API free = 10 req/min
        // Wait 6 seconds between leagues to stay under limit
        await new Promise(resolve => setTimeout(resolve, 6000));

      } catch (leagueError) {
        errors.push({ league: league.name, error: leagueError.message });
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        message: `Fixtures updated at ${new Date().toISOString()}`,
        inserted,
        updated,
        errors: errors.length > 0 ? errors : undefined
      })
    };

  } catch (error) {
    console.error('fetchFixtures error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message })
    };
  }
};
