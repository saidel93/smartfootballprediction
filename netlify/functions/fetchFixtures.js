// netlify/functions/fetchFixtures.js
const https = require("https");
const dns = require("dns");
const { connectToDatabase } = require("./utils/mongodb");

// ✅ Force IPv4 first (fixes many Cloudflare/AWS Lambda TLS issues)
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder("ipv4first");

// ✅ Disable keepAlive to avoid flaky TLS session reuse
const agent = new https.Agent({ keepAlive: false });

exports.handler = async () => {
  try {
    const API_KEY = process.env.FOOTBALL_API_KEY;

    if (!API_KEY) {
      return { statusCode: 500, body: JSON.stringify({ error: "FOOTBALL_API_KEY not set" }) };
    }

    // Date range: today → next 7 days
    const today = new Date();
    const from = today.toISOString().split("T")[0];
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const to = nextWeek.toISOString().split("T")[0];

    const hostname = "v3.football.api-sports.io";
    const path = `/fixtures?league=39&season=2025&from=${from}&to=${to}`;

    const apiData = await new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname,
          servername: hostname,     // explicit SNI
          port: 443,
          method: "GET",
          path,
          family: 4,                // ✅ FORCE IPv4 (important)
          agent,
          headers: {
            "x-apisports-key": API_KEY,
            "Accept": "application/json",
            "Connection": "close"   // ✅ no reuse
          },
          timeout: 20000
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            try {
              const parsed = JSON.parse(data);
              resolve(parsed);
            } catch (e) {
              reject(new Error("Invalid JSON from API: " + data.slice(0, 200)));
            }
          });
        }
      );

      req.on("error", reject);
      req.on("timeout", () => req.destroy(new Error("Request timeout")));
      req.end();
    });

    if (!apiData.response) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Invalid API response", apiData })
      };
    }

    // Save to MongoDB (simple upsert)
    const { db } = await connectToDatabase();
    const col = db.collection("fixtures");

    let inserted = 0;
    let updated = 0;

    for (const item of apiData.response) {
      const f = item.fixture;
      const teams = item.teams;

      const doc = {
        apiId: f.id,
        leagueId: item.league?.id,
        leagueName: item.league?.name,
        leagueCountry: item.league?.country,
        homeTeam: teams.home.name,
        awayTeam: teams.away.name,
        matchDate: new Date(f.date),
        status: f.status.short,
        goalsHome: item.goals?.home ?? null,
        goalsAway: item.goals?.away ?? null,
        updatedAt: new Date()
      };

      const result = await col.updateOne(
        { apiId: f.id },
        { $set: doc },
        { upsert: true }
      );

      if (result.upsertedCount > 0) inserted++;
      else if (result.modifiedCount > 0) updated++;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        inserted,
        updated,
        totalFetched: apiData.response.length
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
