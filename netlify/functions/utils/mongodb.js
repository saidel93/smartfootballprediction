// netlify/functions/utils/mongodb.js
// ============================================================
// MONGODB CONNECTION UTILITY
// ============================================================
// This file creates ONE shared MongoDB connection that all
// your Netlify Functions reuse. This is critical for
// performance — without it, every function call would open
// a new database connection and your Atlas free tier would
// run out of connections instantly.
//
// HOW IT WORKS:
// - First call: connects to MongoDB, caches the connection
// - Subsequent calls: reuses the cached connection
// - Netlify keeps function containers "warm" for ~10 minutes
//   so the cached connection gets reused automatically
// ============================================================

const { MongoClient } = require('mongodb');

// process.env.MONGODB_URI reads the environment variable
// you set in Netlify Dashboard → Site Settings → Environment Variables
// It should look like:
// mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/smartfootball?retryWrites=true&w=majority
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME     = 'smartfootball';

// Cache the client outside the handler so it persists
// between warm function invocations
let cachedClient = null;
let cachedDb     = null;

async function connectToDatabase() {
  // If we already have a connection, return it immediately
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  if (!MONGODB_URI) {
    throw new Error(
      'MONGODB_URI environment variable is not set. ' +
      'Go to Netlify Dashboard → Site Settings → Environment Variables and add it.'
    );
  }

  // Create a new MongoClient
  const client = new MongoClient(MONGODB_URI, {
    // These options prevent connection timeout issues in serverless
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  });

  await client.connect();

  const db = client.db(DB_NAME);

  // Cache for reuse
  cachedClient = client;
  cachedDb     = db;

  console.log('✅ Connected to MongoDB Atlas');
  return { client, db };
}

module.exports = { connectToDatabase, DB_NAME };
