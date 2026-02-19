const fetch = require("node-fetch");
const { MongoClient } = require("mongodb");

exports.handler = async function (event) {

  const fixture = event.queryStringParameters.fixture;
  const apiKey = process.env.FOOTBALL_API_KEY;
  const mongoUri = process.env.MONGODB_URI;

  const response = await fetch(
    `https://v3.football.api-sports.io/predictions?fixture=${fixture}`,
    {
      headers: {
        "x-apisports-key": apiKey,
      },
    }
  );

  const data = await response.json();
  const prediction = data.response[0].predictions;

  const result = {
    winner: prediction.winner.name,
    goals: prediction.goals.home + "-" + prediction.goals.away,
    corners: "AI generated",
    cards: "AI generated"
  };

  const client = new MongoClient(mongoUri);
  await client.connect();
  const db = client.db("smartfootball");
  await db.collection("predictions").insertOne(result);
  await client.close();

  return {
    statusCode: 200,
    body: JSON.stringify(result),
  };
};
