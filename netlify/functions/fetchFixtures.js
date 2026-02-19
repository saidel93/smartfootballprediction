// netlify/functions/fetchFixtures.js
// ============================================================
// FETCH FIXTURES FROM API-SPORTS (Football)
// ============================================================

const { connectToDatabase } = require('./utils/mongodb');
const https = require('https');

// Force TLS 1.2 (prevents SSL alert internal error)
const agent = new https.Agent({
  keepAlive: true,
  secureProtocol: 'TLSv1_2_method'
});

exports.handler = async (event) => {

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, body: '' };
  }

  try {
    const API_KEY = process.env.FOOTBALL_API_KEY;

    if (!API_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({ success: false, error: 'FOOTBALL_API_KEY not set' })
      };
    }

    // Date range: today → next 7 days
    const today = new Date();
    const from = today.toISOString().split('T')[0];

    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const to = nextWeek.toISOString().split('T')[0];

    const url = `https://v3.football.api-sports.io/fixtures?league=39&season=2025&from=${from}&to=${to}`;

    console.log("Calling API:", url);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-apisports-key': API_KEY,
        'Accept': 'application/json'
      },
      agent
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("API ERROR:", text);
      return {
        statusCode: 500,
        body: JSON.stringify({ success: false, error: text })
      };
    }

    const data = await response.json();

    if (!data.response) {
      return {
        statusCode: 500,
        body: JSON.stringify({ success: false, error: 'Invalid API response structure' })
      };
    }

    const { db } = await connectToDatabase();
    const fixturesCol = db.collection('fixtures');

    let inserted = 0;
    let updated = 0;

    for (const item of data.response) {

      const f = item.fixture;
      const teams = item.teams;

      const doc = {
        apiId: f.id,
        leagueId: item.league.id,
        leagueName: item.league.name,
        leagueCountry: item.league.country,
        homeTeam: teams.home.name,
        homeTeamId: teams.home.id,
        awayTeam: teams.away.name,
        awayTeamId: teams.away.id,
        matchDate: new Date(f.date),
        status: f.status.short,
        goalsHome: item.goals.home,
        goalsAway: item.goals.away,
        updatedAt: new Date()
      };

      const result = await fixturesCol.updateOne(
        { apiId: f.id },
        { $set: doc },
        { upsert: true }
      );

      if (result.upsertedCount > 0) inserted++;
      if (result.modifiedCount > 0) updated++;
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        inserted,
        updated,
        totalFetched: data.response.length
      })
    };

  } catch (error) {
    console.error("fetchFixtures ERROR:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message })
    };
  }
};
