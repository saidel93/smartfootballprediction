const axios = require("axios");
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

    const url = `https://v3.football.api-sports.io/fixtures?league=39&season=2025&from=${from}&to=${to}`;

    const response = await axios.get(url, {
      headers: {
        "x-apisports-key": API_KEY
      },
      timeout: 10000
    });

    const data = response.data;

    const { db } = await connectToDatabase();
    const fixturesCol = db.collection("fixtures");

    for (const item of data.response) {
      await fixturesCol.updateOne(
        { apiId: item.fixture.id },
        {
          $set: {
            apiId: item.fixture.id,
            homeTeam: item.teams.home.name,
            awayTeam: item.teams.away.name,
            matchDate: new Date(item.fixture.date),
            leagueName: item.league.name,
            updatedAt: new Date()
          }
        },
        { upsert: true }
      );
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        total: data.response.length
      })
    };

  } catch (error) {
    console.error("ERROR:", error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message
      })
    };
  }
};
