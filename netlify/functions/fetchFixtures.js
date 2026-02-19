// netlify/functions/fetchFixtures.js

const https = require("https");
const { connectToDatabase } = require("./utils/mongodb");

exports.handler = async () => {

  try {

    const API_KEY = process.env.FOOTBALL_API_KEY;

    if (!API_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "FOOTBALL_API_KEY not set" })
      };
    }

    // Date range (today → 7 days)
    const today = new Date();
    const from = today.toISOString().split("T")[0];

    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const to = nextWeek.toISOString().split("T")[0];

    const options = {
      host: "v3.football.api-sports.io",
      port: 443,
      path: `/fixtures?league=39&season=2025&from=${from}&to=${to}`,
      method: "GET",
      headers: {
        "x-apisports-key": API_KEY,
        "Connection": "keep-alive",
        "Accept": "application/json"
      }
    };

    const apiResponse = await new Promise((resolve, reject) => {

      const req = https.request(options, (res) => {

        let data = "";

        res.on("data", chunk => {
          data += chunk;
        });

        res.on("end", () => {
          resolve(JSON.parse(data));
        });

      });

      req.on("error", err => reject(err));
      req.end();
    });

    if (!apiResponse.response) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Invalid API response" })
      };
    }

    // 🔥 CONNECT TO MONGODB
    const { db } = await connectToDatabase();
    const fixturesCol = db.collection("fixtures");

    let inserted = 0;

    for (const item of apiResponse.response) {

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
        createdAt: new Date()
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
        totalFetched: apiResponse.response.length
      })
    };

  } catch (error) {

    console.error("fetchFixtures ERROR:", error);

    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
