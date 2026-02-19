const https = require("https");
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

    const options = {
      host: "v3.football.api-sports.io",
      port: 443,
      path: `/fixtures?league=39&season=2025&from=${from}`,
      method: "GET",
      headers: {
        "x-apisports-key": API_KEY,
        "Connection": "keep-alive",
        "Accept": "application/json"
      }
    };

    const apiResponse = await new Promise((resolve, reject) => {

      const req = https.request(options, (res) => {

        let data = "";

        res.on("data", chunk => {
          data += chunk;
        });

        res.on("end", () => {
          resolve({
            status: res.statusCode,
            body: data
          });
        });

      });

      req.on("error", err => reject(err));
      req.end();
    });

    return {
      statusCode: 200,
      body: apiResponse.body
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
