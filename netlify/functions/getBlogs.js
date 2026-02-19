const { MongoClient } = require("mongodb");

exports.handler = async function () {

  const client = new MongoClient(process.env.MONGODB_URI);
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
    body: JSON.stringify({ blogs }),
  };
};
