# ⚽ SmartFootballPredictions.com

> AI-powered statistical football predictions for 15+ leagues. GPT-4 analysis. 147+ predictions per week. Fully automated.

**Live site:** [smartfootballpredictions.com](https://smartfootballpredictions.com)

---

## 🏗️ Architecture

```
Browser
  │
  ▼
Netlify CDN (index.html — static frontend)
  │
  ▼
Netlify Functions (serverless backend)
  ├── getMatches.js         ← Frontend: load all predictions
  ├── getPrediction.js      ← Frontend: single match page
  ├── getBlogs.js           ← Frontend: blog list + single post
  ├── getAccuracy.js        ← Frontend: accuracy stats
  │
  ├── fetchFixtures.js      ← Football API → MongoDB
  ├── generatePrediction.js ← OpenAI GPT-4 → MongoDB
  ├── generateBlog.js       ← OpenAI GPT-4 → MongoDB
  ├── resolvePredictions.js ← Results → accuracy tracking
  └── cronHourly.js         ← Orchestrator (called by cron-job.org)
  │
  ├── MongoDB Atlas         ← Permanent database
  ├── api-football.com      ← Fixture data
  └── OpenAI API            ← Predictions + blog content
```

## 📁 File Structure

```
smart-football-predictions/
├── index.html                      ← Complete frontend (1 file)
├── netlify.toml                    ← Netlify build config
├── package.json                    ← Node.js dependencies
├── robots.txt                      ← SEO crawler config
├── .gitignore                      ← Protects secrets
├── .env.example                    ← Env variable template
│
└── netlify/
    └── functions/
        ├── utils/
        │   └── mongodb.js          ← Shared DB connection
        ├── cronHourly.js
        ├── fetchFixtures.js
        ├── generatePrediction.js
        ├── generateBlog.js
        ├── resolvePredictions.js
        ├── getMatches.js
        ├── getPrediction.js
        ├── getBlogs.js
        └── getAccuracy.js
```

## 🚀 Deployment (Step-by-Step)

### Step 1 — Fork or upload this repo to GitHub
1. Go to [github.com](https://github.com) → New repository
2. Name it: `smart-football-predictions`
3. Upload all files from this folder

### Step 2 — Connect MongoDB Atlas
1. Go to [mongodb.com/atlas](https://mongodb.com/atlas) → Create free account
2. Create free M0 cluster → name it `smartfootball`
3. Database Access → Add user: `smartfootball-user` with a strong password
4. Network Access → Allow from Anywhere (0.0.0.0/0)
5. Browse Collections → Create database `smartfootball` with these collections:
   - `fixtures` `predictions` `blogs` `results` `accuracy` `leagues`
6. Connect → Node.js driver → copy the URI, replace `<password>`, add `/smartfootball` before `?`

### Step 3 — Deploy to Netlify
1. Go to [app.netlify.com](https://app.netlify.com) → Sign up with GitHub
2. Add new site → Import from GitHub → select your repo
3. Build settings:
   - Build command: `npm install`
   - Publish directory: `.`
   - Functions directory: `netlify/functions` (auto-detected from netlify.toml)
4. Click Deploy

### Step 4 — Set Environment Variables
In Netlify: **Site configuration → Environment variables → Add a variable**

| Variable | Where to get it |
|---|---|
| `FOOTBALL_API_KEY` | [rapidapi.com/api-sports/api/api-football](https://rapidapi.com) → API key |
| `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com) → API keys |
| `MONGODB_URI` | MongoDB Atlas → Connect → Node.js driver URI |
| `CRON_SECRET` | Make up any random 32-char string |
| `AFFILIATE_LINK_1` | Your Bet365 affiliate URL (or `#`) |
| `AFFILIATE_LINK_2` | Your William Hill affiliate URL (or `#`) |

After adding variables → **Trigger new deploy**

### Step 5 — Set up automation (cron-job.org — FREE)
1. Go to [cron-job.org](https://cron-job.org) → Create free account
2. Create Cronjob #1 (hourly):
   - Title: `SmartFootball Hourly`
   - URL: `https://smartfootballpredictions.com/.netlify/functions/cronHourly`
   - Schedule: `0 * * * *` (every hour)
   - Headers: `x-cron-secret: [your CRON_SECRET value]`
3. Create Cronjob #2 (daily blog):
   - Title: `SmartFootball Daily Blog`
   - URL: `https://smartfootballpredictions.com/.netlify/functions/generateBlog`
   - Schedule: `0 7 * * *` (07:00 UTC daily)
   - Headers: `x-cron-secret: [your CRON_SECRET value]`

### Step 6 — Add custom domain
Netlify → Site configuration → Domain management → Add domain → `smartfootballpredictions.com`

---

## 🧪 Testing Your Setup

Test each function in your browser after deployment:

```
# Should return { success: true, total: 0, grouped: [] }
https://yoursite.netlify.app/.netlify/functions/getMatches

# Should return { success: true, inserted: 50-200 } — takes ~2 min
https://yoursite.netlify.app/.netlify/functions/fetchFixtures

# Should return { success: true, generated: 5-20 }
https://yoursite.netlify.app/.netlify/functions/generatePrediction

# Should return { success: true, slug: "..." }
https://yoursite.netlify.app/.netlify/functions/generateBlog

# Should return { success: true, overall: {...} }
https://yoursite.netlify.app/.netlify/functions/getAccuracy
```

**View function logs:** Netlify → Functions tab → click function name

---

## 🌍 15 Leagues Covered

| League | Country | API ID |
|---|---|---|
| Premier League | England 🏴󠁧󠁢󠁥󠁮󠁧󠁿 | 39 |
| La Liga | Spain 🇪🇸 | 140 |
| Serie A | Italy 🇮🇹 | 135 |
| Bundesliga | Germany 🇩🇪 | 78 |
| Ligue 1 | France 🇫🇷 | 61 |
| Champions League | Europe 🇪🇺 | 2 |
| Primeira Liga | Portugal 🇵🇹 | 94 |
| Brasileirão A | Brazil 🇧🇷 | 71 |
| Brasileirão B | Brazil 🇧🇷 | 72 |
| Championship | England 🏴󠁧󠁢󠁥󠁮󠁧󠁿 | 40 |
| League One | England 🏴󠁧󠁢󠁥󠁮󠁧󠁿 | 41 |
| Ligue 2 | France 🇫🇷 | 65 |
| Serie B | Italy 🇮🇹 | 136 |
| 2. Bundesliga | Germany 🇩🇪 | 79 |
| Eredivisie | Netherlands 🇳🇱 | 88 |

---

## 💰 Running Costs

| Service | Plan | Cost |
|---|---|---|
| Netlify | Starter (free) | $0/month |
| MongoDB Atlas | M0 (free) | $0/month |
| api-football.com | Basic | ~$10/month |
| OpenAI API | Pay-as-you-go | ~$2-5/month |
| cron-job.org | Free | $0/month |
| **Total** | | **~$12-15/month** |

---

## ⚠️ Disclaimer

All predictions are generated by statistical AI models for informational and entertainment purposes only. Not betting advice. Always gamble responsibly. BeGambleAware.org. 18+
