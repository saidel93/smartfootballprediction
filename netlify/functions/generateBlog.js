const fetch = require("node-fetch");
const { MongoClient } = require("mongodb");

exports.handler = async function () {

  const openaiKey = process.env.OPENAI_API_KEY;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${openaiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "user", content: "Write a football prediction blog about Premier League weekend matches." }
      ]
    })
  });

  const data = await response.json();
  const content = data.choices[0].message.content;

  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db("smartfootball");

  await db.collection("blogs").insertOne({
    title: "Weekend Football Predictions",
    content: content,
    date: new Date()
  });

  await client.close();

  return {
    statusCode: 200,
    body: JSON.stringify({ success: true }),
  };
};
