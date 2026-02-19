// netlify/functions/fetchFixtures.js

const { connectToDatabase } = require('./utils/mongodb');
const https = require('https');

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

    // Date range
    const today = new Date();
    const from = today.toISOString().split('T')[0];

    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const to = nextWeek.toISOString().split('T')[0];

    const url = `/fixtures?league=39&season=2025&from=${from}&to=${to}`;

    const options = {
      hostname: 'v3.football.api-sports.io',
      path: url,
      method: 'GET',
      headers: {
        'x-apisports-key': API_KEY,
        'Accept': 'application/json'
      }
    };

    const apiResponse = await new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      });

      req.on('error', reject);
      req.end();
    });

    if (apiResponse.status !== 200) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          success: false,
          error: `API status ${apiResponse.status}: ${apiResponse.body}`
        })
      };
    }

    const data = JSON.parse(apiResponse.body);

    const { db } = await connectToDatabase();
    const fixturesCol = db.collection('fixtures');

    let inserted = 0;

    for (const item of data.response || []) {

      const f = item.fixture;
      const teams = item.teams;

      const doc = {
        apiId: f.id,
        leagueId: item.league.id,
        leagueName: item.league.name,
        homeTeam: teams.home.name,
        awayTeam: teams.away.name,
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
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        inserted,
        totalFetched: data.response.length
      })
    };

  } catch (error) {
    console.error("fetchFixtures error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message })
    };
  }
};
