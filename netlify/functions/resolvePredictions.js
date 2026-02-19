// netlify/functions/resolvePredictions.js
// ============================================================
// RESOLVE PREDICTIONS & TRACK ACCURACY
// ============================================================
// Runs every hour. Finds completed matches, compares our
// prediction against the real result, marks correct/wrong,
// and updates the weekly accuracy stats in MongoDB.
// ============================================================

const { connectToDatabase } = require('./utils/mongodb');

// ── Determine actual result from goals ────────────────────────
function getActualResult(goalsHome, goalsAway) {
  if (goalsHome === null || goalsAway === null) return null;
  if (goalsHome > goalsAway) return 'home';
  if (goalsAway > goalsHome) return 'away';
  return 'draw';
}

// ── Get week key string (e.g. "2026-W08") ─────────────────────
function getWeekKey(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const week = Math.ceil(((d - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, body: '' };

  try {
    const { db } = await connectToDatabase();
    const fixturesCol    = db.collection('fixtures');
    const predictionsCol = db.collection('predictions');
    const accuracyCol    = db.collection('accuracy');

    // Find predictions not yet resolved
    const unresolved = await predictionsCol.find({
      isResolved: false
    }).toArray();

    let resolved = 0;
    let correct  = 0;

    for (const prediction of unresolved) {
      // Get the corresponding fixture
      const fixture = await fixturesCol.findOne({ apiId: prediction.fixtureId });
      if (!fixture) continue;

      // Only resolve if match is finished (FT = Full Time, AET = After Extra Time, PEN = Penalties)
      const finishedStatuses = ['FT', 'AET', 'PEN'];
      if (!finishedStatuses.includes(fixture.status)) continue;

      const actualResult     = getActualResult(fixture.goalsHome, fixture.goalsAway);
      if (!actualResult) continue;

      const predictionCorrect = prediction.predictedWinner === actualResult;
      if (predictionCorrect) correct++;

      // Update prediction with result
      await predictionsCol.updateOne(
        { _id: prediction._id },
        {
          $set: {
            isResolved:        true,
            actualResult,
            predictionCorrect,
            actualGoalsHome:   fixture.goalsHome,
            actualGoalsAway:   fixture.goalsAway,
            resolvedAt:        new Date(),
          }
        }
      );

      // ── Update weekly accuracy stats ─────────────────────────
      const weekKey = getWeekKey(fixture.matchDate);
      const leagueKey = fixture.leagueName || 'Unknown';

      // Upsert weekly overall accuracy
      await accuracyCol.updateOne(
        { weekKey, type: 'overall' },
        {
          $inc: {
            total:   1,
            correct: predictionCorrect ? 1 : 0
          },
          $set: { updatedAt: new Date() },
          $setOnInsert: { weekKey, type: 'overall', createdAt: new Date() }
        },
        { upsert: true }
      );

      // Upsert per-league accuracy
      await accuracyCol.updateOne(
        { weekKey, type: 'league', league: leagueKey },
        {
          $inc: {
            total:   1,
            correct: predictionCorrect ? 1 : 0
          },
          $set: { updatedAt: new Date() },
          $setOnInsert: { weekKey, type: 'league', league: leagueKey, createdAt: new Date() }
        },
        { upsert: true }
      );

      resolved++;
    }

    // ── Compute accuracy percentage for current week ────────────
    const currentWeek = getWeekKey(new Date());
    const weekStats   = await accuracyCol.findOne({ weekKey: currentWeek, type: 'overall' });
    const weekAccuracy = weekStats && weekStats.total > 0
      ? Math.round((weekStats.correct / weekStats.total) * 100)
      : null;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        resolved,
        correct,
        currentWeekAccuracy: weekAccuracy ? `${weekAccuracy}%` : 'not enough data',
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('resolvePredictions error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
