// netlify/functions/fetchFixtures.js

const { connectToDatabase } = require('./utils/mongodb');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, body: '' };
  }

  try {
    const fetch = (await import('node-fetch')).default;

    const API_KEY = process.env.FOOTBALL_API_KEY;
    if (!API_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'FOOTBALL_API_KEY not set' })
      };
    }

    const from = new Date().toISOString().split('T')[0];
    const toDate = new Date();
    toDate.setDate(toDate.getDate() + 7);
    const to = toDate.toISOString().split('T')[0];

    const url = `https://v3.football.api-sports.io/fixtures?league=39&season=2025&from=${from}&to=${to}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-apisports-key': API_KEY
      }
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        statusCode: 500,
        body: JSON.stringify({ error: `API error: ${text}` })
      };
    }

    const data = await response.json();

    const { db } = await connectToDatabase();
    const col = db.collection('fixtures');

    let inserted = 0;

    for (const item of data.response || []) {
      const f = item.fixture;
      const teams = item.teams;

      const doc = {
        apiId: f.id,
        homeTeam: teams.home.name,
        awayTeam: teams.away.name,
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
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        inserted
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
