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

    const today = new Date();
    const from = today.toISOString().split("T")[0];

    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const to = nextWeek.toISOString().split("T")[0];

    const options = {
      hostname: "v3.football.api-sports.io",
      port: 443,
      path: `/fixtures?league=39&season=2025&from=${from}&to=${to}`,
      method: "GET",
      headers: {
        "x-apisports-key": API_KEY,
        "Accept": "application/json"
      },
      secureProtocol: "TLSv1_2_method"   // 🔥 force TLS 1.2
    };

    const apiData = await new Promise((resolve, reject) => {

      const req = https.request(options, (res) => {

        let data = "";

        res.on("data", chunk => data += chunk);

        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error("Invalid JSON from API"));
          }
        });

      });

      req.on("error", reject);
      req.end();
    });

    if (!apiData.response) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Invalid API response" })
      };
    }

    const { db } = await connectToDatabase();
    const col = db.collection("fixtures");

    let inserted = 0;

    for (const item of apiData.response) {

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
        inserted,
        totalFetched: apiData.response.length
      })
    };

  } catch (error) {

    console.error("SSL ERROR:", error);

    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
