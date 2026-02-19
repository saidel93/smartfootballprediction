// netlify/functions/getPrediction.js
// URL: /.netlify/functions/getPrediction?slug=man-city-vs-liverpool-2026-02-22
const { connectToDatabase } = require('./utils/mongodb');

const H = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: H, body: '' };
  const slug = event.queryStringParameters?.slug;
  if (!slug) return { statusCode: 400, headers: H, body: JSON.stringify({ error: 'slug is required' }) };
  try {
    const { db } = await connectToDatabase();
    const prediction = await db.collection('predictions').findOne({ slug });
    if (!prediction) return { statusCode: 404, headers: H, body: JSON.stringify({ error: 'Prediction not found' }) };
    const fixture = await db.collection('fixtures').findOne({ apiId: prediction.fixtureId });
    return { statusCode: 200, headers: H, body: JSON.stringify({ success: true, prediction: { ...prediction, _id: prediction._id?.toString() }, fixture: fixture ? { ...fixture, _id: fixture._id?.toString() } : null }) };
  } catch (e) {
    console.error('getPrediction:', e);
    return { statusCode: 500, headers: H, body: JSON.stringify({ error: e.message }) };
  }
};
