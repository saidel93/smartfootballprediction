const { MongoClient } = require("mongodb");

exports.handler = async function () {
  try {

    const openaiKey = process.env.OPENAI_API_KEY;
    const mongoUri = process.env.MONGODB_URI;

    if (!openaiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Missing OPENAI_API_KEY" })
      };
    }

    if (!mongoUri) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Missing MONGODB_URI" })
      };
    }

    // 🔥 Call OpenAI
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

    if (!data.choices || !data.choices[0]) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "OpenAI response invalid", data })
      };
    }

    const content = data.choices[0].message.content;

    // 🔥 Save to MongoDB
    const client = new MongoClient(mongoUri);
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
      body: JSON.stringify({ success: true })
    };

  } catch (error) {
    console.error("GenerateBlog Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
