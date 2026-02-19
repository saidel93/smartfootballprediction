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
        body: JSON.stringify({ success: false, error: "FOOTBALL_API_KEY not set" })
      };
    }

    const today = new Date();
    const from = today.toISOString().split('T')[0];

    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const to = nextWeek.toISOString().split('T')[0];

    const options = {
      hostname: 'v3.football.api-sports.io',
      path: `/fixtures?league=39&season=2025&from=${from}&to=${to}`,
      method: 'GET',
      headers: {
        'x-apisports-key': API_KEY,
        'Accept': 'application/json'
      }
    };

    const data = await new Promise((resolve, reject) => {
      const req = https.request(options, (res) => {

        let body = '';

        res.on('data', chunk => {
          body += chunk;
        });

        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(new Error("Failed to parse API response: " + body));
          }
        });

      });

      req.on('error', err => reject(err));
      req.end();
    });

    if (!data.response) {
      return {
        statusCode: 500,
        body: JSON.stringify({ success: false, error: "Invalid API response" })
      };
    }

    const { db } = await connectToDatabase();
    const col = db.collection('fixtures');

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

      const result = await col.updateOne(
        { apiId: f.id },
        { $set: doc },
        { upsert: true }
      );

      if (result.upsertedCount > 0) inserted++;
      if (result.modifiedCount > 0) updated++;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        inserted,
        updated,
        totalFetched: data.response.length
      })
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
};
