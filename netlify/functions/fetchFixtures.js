// netlify/functions/fetchFixtures.js
// ============================================================
// FETCH FIXTURES FROM FOOTBALL API
// ============================================================

const { connectToDatabase } = require('./utils/mongodb');

// ── Helper: modern fetch request (FIXES SSL ISSUE) ───────────
async function apiGet(url, headers) {
  const response = await fetch(url, {
    method: "GET",
    headers
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Football API error: ${response.status} - ${text}`);
  }

  return await response.json();
}

// ── The 15 leagues we cover ────────────────────────────────────
const LEAGUE_IDS = [
  { id: 39,  name: 'Premier League', country: 'England', flag: '🏴' },
  { id: 140, name: 'La Liga', country: 'Spain', flag: '🇪🇸' },
  { id: 135, name: 'Serie A', country: 'Italy', flag: '🇮🇹' },
  { id: 78,  name: 'Bundesliga', country: 'Germany', flag: '🇩🇪' },
  { id: 61,  name: 'Ligue 1', country: 'France', flag: '🇫🇷' },
  { id: 2,   name: 'Champions League', country: 'Europe', flag: '🇪🇺' },
  { id: 94,  name: 'Primeira Liga', country: 'Portugal', flag: '🇵🇹' },
  { id: 71,  name: 'Brasileirão A', country: 'Brazil', flag: '🇧🇷' },
  { id: 72,  name: 'Brasileirão B', country: 'Brazil', flag: '🇧🇷' },
  { id: 40,  name: 'Championship', country: 'England', flag: '🏴' },
  { id: 41,  name: 'League One', country: 'England', flag: '🏴' },
  { id: 65,  name: 'Ligue 2', country: 'France', flag: '🇫🇷' },
  { id: 136, name: 'Serie B', country: 'Italy', flag: '🇮🇹' },
  { id: 79,  name: '2. Bundesliga', country: 'Germany', flag: '🇩🇪' },
  { id: 88,  name: 'Eredivisie', country: 'Netherlands', flag: '🇳🇱' },
];

// ── Date helper ───────────────────────────────────────────────
function dateStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
}

// ── Slug helper ───────────────────────────────────────────────
function createSlug(home, away, date) {
  const clean = str =>
    str.toLowerCase()
       .replace(/[^a-z0-9]/g, '-')
       .replace(/-+/g, '-')
       .replace(/^-|-$/g, '');

  return `${clean(home)}-vs-${clean(away)}-${date}`;
}

// ── Main handler ───────────────────────────────────────────────
exports.handler = async (event) => {

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, body: '' };
  }

  const secret = event.headers['x-cron-secret'];
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const API_KEY = process.env.FOOTBALL_API_KEY;
  if (!API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'FOOTBALL_API_KEY not set' })
    };
  }

  try {
    const { db } = await connectToDatabase();
    const fixturesCollection = db.collection('fixtures');

    await fixturesCollection.createIndex({ apiId: 1 }, { unique: true });

    let inserted = 0;
    let updated  = 0;
    let errors   = [];

    for (const league of LEAGUE_IDS) {
      try {

        const from = dateStr(0);
        const to   = dateStr(7);

        const url =
          `https://v3.football.api-sports.io/fixtures` +
          `?league=${league.id}&season=2025&from=${from}&to=${to}`;

        const response = await apiGet(url, {
          'x-apisports-key': API_KEY
        });

        if (!response.response) continue;

        for (const fixture of response.response) {

          const f     = fixture.fixture;
          const teams = fixture.teams;
          const goals = fixture.goals;

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
            status:     f.status.short,
            statusLong: f.status.long,
            goalsHome:  goals.home,
            goalsAway:  goals.away,
            slug: createSlug(
              teams.home.name,
              teams.away.name,
              f.date.split('T')[0]
            ),
            updatedAt: new Date(),
          };

          try {
            const result = await fixturesCollection.updateOne(
              { apiId: f.id },
              { $set: doc },
              { upsert: true }
            );

            if (result.upsertedCount > 0) inserted++;
            else if (result.modifiedCount > 0) updated++;

          } catch (dupError) {}
        }

        // Respect API rate limit (free plan)
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
        inserted,
        updated,
        errors: errors.length > 0 ? errors : undefined,
        timestamp: new Date().toISOString()
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
