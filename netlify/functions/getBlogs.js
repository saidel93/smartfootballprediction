// netlify/functions/getBlogs.js
// URL: /.netlify/functions/getBlogs?limit=12&category=weekend-picks
// URL: /.netlify/functions/getBlogs?slug=some-blog-slug
const { connectToDatabase } = require('./utils/mongodb');

const H = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: H, body: '' };
  try {
    const { db } = await connectToDatabase();
    const p = event.queryStringParameters || {};

    // Single blog
    if (p.slug) {
      const blog = await db.collection('blogs').findOne({ slug: p.slug, isPublished: true });
      if (!blog) return { statusCode: 404, headers: H, body: JSON.stringify({ error: 'Blog not found' }) };
      return { statusCode: 200, headers: H, body: JSON.stringify({ success: true, blog: { ...blog, _id: blog._id?.toString() } }) };
    }

    // Blog listing
    const query = { isPublished: true };
    if (p.category && p.category !== 'all') query.category = p.category;
    const limit = Math.min(parseInt(p.limit) || 12, 50);
    const skip  = parseInt(p.page || 0) * limit;

    const [blogs, total] = await Promise.all([
      db.collection('blogs').find(query, { projection: { content: 0 } }).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
      db.collection('blogs').countDocuments(query),
    ]);

    return { statusCode: 200, headers: H, body: JSON.stringify({ success: true, blogs: blogs.map(b => ({ ...b, _id: b._id?.toString() })), total, hasMore: skip + limit < total }) };
  } catch (e) {
    console.error('getBlogs:', e);
    return { statusCode: 500, headers: H, body: JSON.stringify({ error: e.message }) };
  }
};
