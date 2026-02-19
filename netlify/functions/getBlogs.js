// netlify/functions/getBlogs.js

const { MongoClient } = require("mongodb");

exports.handler = async function () {
  try {

    const mongoUri = process.env.MONGODB_URI;

    if (!mongoUri) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "MONGODB_URI not set" })
      };
    }

    const client = new MongoClient(mongoUri);
    await client.connect();

    const db = client.db("smartfootball");

    const blogs = await db.collection("blogs")
      .find({})
      .sort({ date: -1 })
      .limit(5)
      .toArray();

    await client.close();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blogs })
    };

  } catch (error) {
    console.error("getBlogs error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
