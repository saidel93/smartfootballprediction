// netlify/functions/getPrediction.js
// Uses native fetch (Node 18+)

const { MongoClient } = require("mongodb");

exports.handler = async function (event) {
  try {

    const fixture = event.queryStringParameters?.fixture;
    const apiKey = process.env.FOOTBALL_API_KEY;
    const mongoUri = process.env.MONGODB_URI;

    if (!fixture) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing fixture parameter" })
      };
    }

    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "FOOTBALL_API_KEY not set" })
      };
    }

    if (!mongoUri) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "MONGODB_URI not set" })
      };
    }

    // 🔥 Call Football API
    const response = await fetch(
      `https://v3.football.api-sports.io/predictions?fixture=${fixture}`,
      {
        headers: {
          "x-apisports-key": apiKey,
        },
      }
    );

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: "Football API error" })
      };
    }

    const data = await response.json();

    if (!data.response || !data.response[0]) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Prediction not found" })
      };
    }

    const prediction = data.response[0].predictions;

    const result = {
      fixtureId: fixture,
      winner: prediction.winner?.name || "Unknown",
      goals: `${prediction.goals.home}-${prediction.goals.away}`,
      corners: "AI generated",
      cards: "AI generated",
      createdAt: new Date()
    };

    // 🔥 Save to MongoDB
    const client = new MongoClient(mongoUri);
    await client.connect();
    const db = client.db("smartfootball");

    await db.collection("predictions").updateOne(
      { fixtureId: fixture },
      { $set: result },
      { upsert: true }
    );

    await client.close();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result)
    };

  } catch (error) {
    console.error("getPrediction error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
