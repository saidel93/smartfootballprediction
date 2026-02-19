// netlify/functions/generatePrediction.js
// ============================================================
// GENERATE AI PREDICTION USING OPENAI GPT-4
// ============================================================
// Called by cronHourly to generate predictions for upcoming
// matches that don't have one yet.
//
// URL: /.netlify/functions/generatePrediction
// Also callable directly:
//   /.netlify/functions/generatePrediction?fixtureId=12345
//
// WHAT IT DOES:
// 1. Finds fixtures in MongoDB with no prediction yet
// 2. For each, calls OpenAI GPT-4 to generate:
//    - Win probabilities (home/draw/away)
//    - Expected goals
//    - Confidence score
//    - 400-500 word AI analysis
//    - SEO meta title + description
//    - 3-5 key facts
// 3. Saves prediction to MongoDB predictions collection
// ============================================================

const { connectToDatabase } = require('./utils/mongodb');
const https = require('https');

// ── OpenAI API helper ──────────────────────────────────────────
// WHY NOT IN FRONTEND: If OPENAI_API_KEY were in your frontend
// JavaScript, anyone could open DevTools and steal your key,
// racking up thousands of dollars in API charges.
// In a Netlify Function, it stays server-side and private.
function callOpenAI(messages, model = 'gpt-4o-mini') {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: 1200,
      response_format: { type: 'json_object' }
    });

    const options = {
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        // ── THIS IS WHERE OPENAI IS CALLED ──────────────────
        // process.env.OPENAI_API_KEY is your OpenAI secret key
        // set in Netlify Dashboard → Site Settings → Env Vars
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) reject(new Error(parsed.error.message));
          else resolve(parsed);
        } catch (e) { reject(e); }
      });
    });

    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('OpenAI timeout')); });
    req.write(body);
    req.end();
  });
}

// ── Poisson distribution: P(X = k) = e^(-λ) * λ^k / k! ───────
function poissonPMF(lambda, k) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logP = -lambda + k * Math.log(lambda);
  for (let i = 1; i <= k; i++) logP -= Math.log(i);
  return Math.exp(logP);
}

// ── Calculate win probabilities using Poisson model ────────────
function calculateProbabilities(homeXG, awayXG) {
  const MAX_GOALS = 8;
  let homeWin = 0, draw = 0, awayWin = 0;

  for (let h = 0; h <= MAX_GOALS; h++) {
    for (let a = 0; a <= MAX_GOALS; a++) {
      const p = poissonPMF(homeXG, h) * poissonPMF(awayXG, a);
      if (h > a) homeWin += p;
      else if (h === a) draw += p;
      else awayWin += p;
    }
  }

  const total = homeWin + draw + awayWin;
  return {
    homeWin: Math.round((homeWin / total) * 100),
    draw:    Math.round((draw / total) * 100),
    awayWin: Math.round((awayWin / total) * 100),
  };
}

// ── Generate the OpenAI prompt for a match ────────────────────
function buildPrompt(fixture) {
  return {
    role: 'user',
    content: `You are a football statistics analyst for SmartFootballPredictions.com.

Generate a complete JSON prediction for this match:
- Home team: ${fixture.homeTeam}
- Away team: ${fixture.awayTeam}  
- League: ${fixture.leagueName} (${fixture.leagueCountry})
- Date: ${new Date(fixture.matchDate).toDateString()}

Return ONLY valid JSON with this exact structure:
{
  "homeXG": <number 0.5-3.5>,
  "awayXG": <number 0.5-3.5>,
  "predictedWinner": "<home|draw|away>",
  "confidenceScore": <number 45-90>,
  "over25Probability": <number 0-100>,
  "expectedCorners": <number 7-13>,
  "expectedYellowCards": <number 2-6>,
  "keyFacts": [
    "<fact about home team form or stats>",
    "<fact about away team form or stats>",
    "<fact about head to head or league context>",
    "<tactical or injury insight>"
  ],
  "analysis": "<400-500 word SEO-optimized match analysis. Use natural language. Mention both teams by full name. Include statistics references. End with a clear predicted outcome. Do NOT say 'bet' or use gambling language. Say 'our model predicts' instead.>",
  "seoTitle": "${fixture.homeTeam} vs ${fixture.awayTeam} Prediction – ${fixture.leagueName} ${new Date(fixture.matchDate).toLocaleDateString('en-GB', {day:'numeric', month:'long', year:'numeric'})} | SmartFootballPredictions",
  "metaDescription": "<155-160 character SEO meta description mentioning the teams, league, date, and key prediction stat>"
}`
  };
}

// ── Main handler ───────────────────────────────────────────────
exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, body: '' };

  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'OPENAI_API_KEY not set' }) };
  }

  try {
    const { db } = await connectToDatabase();
    const fixturesCol   = db.collection('fixtures');
    const predictionsCol = db.collection('predictions');

    // Create unique index on matchId
    await predictionsCol.createIndex({ fixtureId: 1 }, { unique: true });

    // Check if a specific fixture was requested
    const specificId = event.queryStringParameters?.fixtureId;

    let fixtures;
    if (specificId) {
      fixtures = await fixturesCol.find({ apiId: parseInt(specificId) }).toArray();
    } else {
      // Find all upcoming fixtures without predictions (next 48 hours)
      const now    = new Date();
      const cutoff = new Date(now.getTime() + 48 * 60 * 60 * 1000);

      // Get fixture IDs that already have predictions
      const existingPreds = await predictionsCol.distinct('fixtureId');

      fixtures = await fixturesCol.find({
        matchDate: { $gte: now, $lte: cutoff },
        status: 'NS', // Not Started
        apiId: { $nin: existingPreds }
      }).limit(20).toArray(); // Max 20 per run to control OpenAI costs
    }

    let generated = 0;
    let skipped   = 0;
    const results = [];

    for (const fixture of fixtures) {
      try {
        // Build OpenAI prompt
        const messages = [
          {
            role: 'system',
            content: 'You are a professional football statistics analyst. Always respond with valid JSON only. No markdown, no explanation outside JSON.'
          },
          buildPrompt(fixture)
        ];

        // ── CALL OPENAI API ──────────────────────────────────
        const completion = await callOpenAI(messages);
        const content    = completion.choices[0].message.content;
        const aiData     = JSON.parse(content);

        // Calculate Poisson probabilities from OpenAI's xG
        const probs = calculateProbabilities(aiData.homeXG || 1.5, aiData.awayXG || 1.1);

        // Build prediction document
        const prediction = {
          fixtureId:      fixture.apiId,
          slug:           fixture.slug,
          homeTeam:       fixture.homeTeam,
          awayTeam:       fixture.awayTeam,
          leagueName:     fixture.leagueName,
          leagueCountry:  fixture.leagueCountry,
          leagueFlag:     fixture.leagueFlag,
          matchDate:      fixture.matchDate,

          // Statistical predictions
          homeWinProbability: probs.homeWin,
          drawProbability:    probs.draw,
          awayWinProbability: probs.awayWin,
          homeXG:             aiData.homeXG,
          awayXG:             aiData.awayXG,
          over25Probability:  aiData.over25Probability,
          expectedCorners:    aiData.expectedCorners,
          expectedYellowCards: aiData.expectedYellowCards,
          predictedWinner:    aiData.predictedWinner,
          confidenceScore:    aiData.confidenceScore,

          // GPT-4 content
          keyFacts:    aiData.keyFacts,
          analysis:    aiData.analysis,
          seoTitle:    aiData.seoTitle,
          metaDescription: aiData.metaDescription,

          // Accuracy tracking (filled in after match)
          isResolved:        false,
          actualResult:      null,  // 'home' | 'draw' | 'away'
          predictionCorrect: null,  // true | false

          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await predictionsCol.updateOne(
          { fixtureId: fixture.apiId },
          { $set: prediction },
          { upsert: true }
        );

        generated++;
        results.push({
          match: `${fixture.homeTeam} vs ${fixture.awayTeam}`,
          winner: aiData.predictedWinner,
          confidence: aiData.confidenceScore
        });

        // Wait 2 seconds between OpenAI calls to avoid rate limits
        await new Promise(r => setTimeout(r, 2000));

      } catch (fixtureError) {
        skipped++;
        console.error(`Error generating prediction for ${fixture.homeTeam} vs ${fixture.awayTeam}:`, fixtureError.message);
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        generated,
        skipped,
        results,
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('generatePrediction error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
