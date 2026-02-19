// netlify/functions/getMatches.js
// Uses native fetch (Node 18+)

exports.handler = async function () {
  try {

    const apiKey = process.env.FOOTBALL_API_KEY;

    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "FOOTBALL_API_KEY not set" })
      };
    }

    const response = await fetch(
      "https://v3.football.api-sports.io/fixtures?league=39&season=2025&next=5",
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

    if (!data.response) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Invalid API response" })
      };
    }

    const matches = data.response.map(m => ({
      fixture: m.fixture.id,
      home: m.teams.home.name,
      away: m.teams.away.name
    }));

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matches })
    };

  } catch (error) {
    console.error("getMatches error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
