// netlify/functions/generateBlog.js
// ============================================================
// GENERATE DAILY BLOG POSTS USING OPENAI GPT-4
// ============================================================
// Called by cron-job.org every day at 07:00 UTC
// URL: /.netlify/functions/generateBlog
//
// WHAT IT DOES:
// 1. Fetches today's and tomorrow's top matches from MongoDB
// 2. Calls OpenAI GPT-4 to write a full blog article
// 3. Saves the blog permanently in MongoDB blogs collection
// 4. Blogs are NEVER deleted — they build up your SEO over time
//
// BLOG TYPES GENERATED:
// - "weekend-picks"    → Friday/Saturday (top picks for weekend)
// - "daily-preview"   → Monday-Thursday (daily match preview)
// - "results-review"  → Monday morning (previous week results)
// ============================================================

const { connectToDatabase } = require('./utils/mongodb');
const https = require('https');

// ── OpenAI API helper (same as in generatePrediction.js) ──────
function callOpenAI(messages, maxTokens = 2000) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.75,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' }
    });

    const options = {
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
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
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('OpenAI timeout')); });
    req.write(body);
    req.end();
  });
}

// ── Create a URL slug ──────────────────────────────────────────
function createSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 80);
}

// ── Calculate reading time ─────────────────────────────────────
function readingTime(text) {
  const words = text.split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

// ── Determine blog type based on day of week ──────────────────
function getBlogType() {
  const day = new Date().getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  if (day === 5 || day === 6) return 'weekend-picks';   // Fri, Sat
  if (day === 1)              return 'results-review';  // Monday
  return 'daily-preview';
}

// ── Main handler ───────────────────────────────────────────────
exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, body: '' };

  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'OPENAI_API_KEY not configured' }) };
  }

  try {
    const { db } = await connectToDatabase();
    const fixturesCol    = db.collection('fixtures');
    const predictionsCol = db.collection('predictions');
    const blogsCol       = db.collection('blogs');

    // Index for fast lookup
    await blogsCol.createIndex({ slug: 1 }, { unique: true });
    await blogsCol.createIndex({ createdAt: -1 });

    const blogType = getBlogType();
    const today    = new Date();
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfter = new Date(today); dayAfter.setDate(dayAfter.getDate() + 2);

    // ── Get top matches with predictions for the blog ──────────
    const upcomingFixtures = await fixturesCol.find({
      matchDate: { $gte: today, $lte: dayAfter },
      status: 'NS'
    }).sort({ matchDate: 1 }).limit(10).toArray();

    // Get their predictions
    const fixtureIds = upcomingFixtures.map(f => f.apiId);
    const predictions = await predictionsCol.find({
      fixtureId: { $in: fixtureIds }
    }).toArray();

    const predMap = {};
    predictions.forEach(p => { predMap[p.fixtureId] = p; });

    // Build match summaries for the prompt
    const matchSummaries = upcomingFixtures
      .filter(f => predMap[f.apiId])
      .slice(0, 6)
      .map(f => {
        const p = predMap[f.apiId];
        return `- ${f.homeTeam} vs ${f.awayTeam} (${f.leagueName}): ${p.homeWinProbability}%/${p.drawProbability}%/${p.awayWinProbability}% — Predicted: ${p.predictedWinner === 'home' ? f.homeTeam : p.predictedWinner === 'away' ? f.awayTeam : 'Draw'} (${p.confidenceScore}% confidence)`;
      })
      .join('\n');

    const dateStr = today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    // ── Build the OpenAI prompt ────────────────────────────────
    const blogTypeLabel = {
      'weekend-picks': 'Weekend Football Predictions',
      'daily-preview': 'Daily Football Preview',
      'results-review': 'Weekly Results Review'
    }[blogType];

    const prompt = `You are a professional football writer for SmartFootballPredictions.com.

Write a full blog article for ${dateStr}.
Article type: ${blogTypeLabel}

Upcoming matches with our AI predictions:
${matchSummaries || 'General football preview (no specific fixtures available)'}

Return ONLY valid JSON with this exact structure:
{
  "title": "<engaging 60-70 char SEO blog title including date or week reference>",
  "seoTitle": "<55-65 char title tag for Google>",
  "metaDescription": "<150-160 char meta description with primary keywords>",
  "excerpt": "<2-3 sentence article summary for blog listing>",
  "category": "${blogType}",
  "content": "<Full article in HTML. Use <h2>, <h3>, <p>, <ul><li> tags. Minimum 600 words. Include: intro paragraph, section per featured match with analysis, statistical insight, conclusion. Mention SmartFootballPredictions.com. Use natural SEO keywords like 'football predictions today', 'best football bets', 'football match preview'. Include a disclaimer at the end that predictions are for entertainment only.>",
  "tags": ["football predictions", "${blogType}", "match preview", "<league name 1>", "<league name 2>"],
  "relatedMatches": [<list of "HomeTeam vs AwayTeam" strings for the featured matches>]
}`;

    const messages = [
      {
        role: 'system',
        content: 'You are an expert football analyst and SEO writer. Always respond with valid JSON only. No markdown code blocks.'
      },
      { role: 'user', content: prompt }
    ];

    // ── CALL OPENAI ────────────────────────────────────────────
    const completion = await callOpenAI(messages, 2500);
    const rawContent = completion.choices[0].message.content;
    const blogData   = JSON.parse(rawContent);

    const slug = createSlug(blogData.title) + '-' + today.toISOString().split('T')[0];

    // Check if a blog with this slug already exists today
    const existing = await blogsCol.findOne({ slug });
    if (existing) {
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, message: 'Blog already generated for today', slug })
      };
    }

    // ── SAVE BLOG TO MONGODB ───────────────────────────────────
    // Blogs are saved permanently — they never get deleted
    // Each day a new blog is added, building SEO over time
    const blog = {
      title:           blogData.title,
      slug,
      seoTitle:        blogData.seoTitle,
      metaDescription: blogData.metaDescription,
      excerpt:         blogData.excerpt,
      content:         blogData.content,
      category:        blogData.category,
      tags:            blogData.tags || [],
      relatedMatches:  blogData.relatedMatches || [],
      isPublished:     true,
      readingTime:     readingTime(blogData.content),
      createdAt:       new Date(),
      updatedAt:       new Date(),
    };

    await blogsCol.insertOne(blog);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        message: `Blog "${blog.title}" created successfully`,
        slug,
        wordCount: blogData.content.split(' ').length
      })
    };

  } catch (error) {
    console.error('generateBlog error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
