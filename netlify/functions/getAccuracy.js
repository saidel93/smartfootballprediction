// netlify/functions/getAccuracy.js
const { connectToDatabase } = require('./utils/mongodb');

const H = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: H, body: '' };
  try {
    const { db } = await connectToDatabase();
    const weeks = Math.min(parseInt(event.queryStringParameters?.weeks) || 8, 52);

    const [weeklyStats, leagueStats] = await Promise.all([
      db.collection('accuracy').find({ type: 'overall' }).sort({ weekKey: -1 }).limit(weeks).toArray(),
      db.collection('accuracy').find({ type: 'league' }).sort({ weekKey: -1 }).toArray(),
    ]);

    // Aggregate league stats
    const leagueSummary = {};
    leagueStats.forEach(row => {
      if (!leagueSummary[row.league]) leagueSummary[row.league] = { total: 0, correct: 0 };
      leagueSummary[row.league].total   += row.total;
      leagueSummary[row.league].correct += row.correct;
    });

    const byLeague = Object.entries(leagueSummary)
      .map(([league, s]) => ({ league, total: s.total, correct: s.correct, accuracy: s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0 }))
      .filter(l => l.total >= 3)
      .sort((a, b) => b.accuracy - a.accuracy);

    const allTime = byLeague.reduce((acc, l) => ({ total: acc.total + l.total, correct: acc.correct + l.correct }), { total: 0, correct: 0 });

    return {
      statusCode: 200, headers: H,
      body: JSON.stringify({
        success: true,
        overall: { total: allTime.total, correct: allTime.correct, accuracy: allTime.total > 0 ? Math.round((allTime.correct / allTime.total) * 100) : 0 },
        weeklyTrend: weeklyStats.map(w => ({ week: w.weekKey, total: w.total, correct: w.correct, accuracy: w.total > 0 ? Math.round((w.correct / w.total) * 100) : 0 })),
        byLeague,
      }),
    };
  } catch (e) {
    console.error('getAccuracy:', e);
    return { statusCode: 500, headers: H, body: JSON.stringify({ error: e.message }) };
  }
};
