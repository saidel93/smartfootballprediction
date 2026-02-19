const fetch = require("node-fetch");

exports.handler = async function () {
  const apiKey = process.env.FOOTBALL_API_KEY;

  const response = await fetch(
    "https://v3.football.api-sports.io/fixtures?league=39&season=2024&next=5",
    {
      headers: {
        "x-apisports-key": apiKey,
      },
    }
  );

  const data = await response.json();

  const matches = data.response.map(m => ({
    fixture: m.fixture.id,
    home: m.teams.home.name,
    away: m.teams.away.name
  }));

  return {
    statusCode: 200,
    body: JSON.stringify({ matches }),
  };
};
