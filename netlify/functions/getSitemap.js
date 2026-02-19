// netlify/functions/getSitemap.js
// ============================================================
// DYNAMIC XML SITEMAP FOR SEO
// URL: /.netlify/functions/getSitemap
// Or set up a redirect in netlify.toml to serve at /sitemap.xml
//
// Generates a sitemap with all match prediction pages and blogs
// Submit this URL to Google Search Console for indexing.
// ============================================================

const { connectToDatabase } = require('./utils/mongodb');

const SITE = 'https://smartfootballpredictions.com';

function xmlEscape(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

exports.handler = async (event) => {
  try {
    const { db } = await connectToDatabase();

    // Get all prediction slugs
    const predictions = await db.collection('predictions')
      .find({}, { projection: { slug: 1, matchDate: 1, updatedAt: 1 } })
      .sort({ matchDate: -1 })
      .limit(5000)
      .toArray();

    // Get all blog slugs
    const blogs = await db.collection('blogs')
      .find({ isPublished: true }, { projection: { slug: 1, createdAt: 1 } })
      .sort({ createdAt: -1 })
      .toArray();

    // Static pages
    const staticPages = [
      { url: '/', priority: '1.0', changefreq: 'hourly' },
      { url: '/#matches', priority: '0.9', changefreq: 'hourly' },
      { url: '/#blog', priority: '0.8', changefreq: 'daily' },
      { url: '/#accuracy', priority: '0.7', changefreq: 'daily' },
    ];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;

    // Static pages
    staticPages.forEach(p => {
      xml += `
  <url>
    <loc>${SITE}${p.url}</loc>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`;
    });

    // Prediction pages
    predictions.forEach(p => {
      if (!p.slug) return;
      const lastmod = (p.updatedAt || p.matchDate || new Date()).toISOString().split('T')[0];
      xml += `
  <url>
    <loc>${SITE}/predictions/${xmlEscape(p.slug)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>hourly</changefreq>
    <priority>0.8</priority>
  </url>`;
    });

    // Blog pages
    blogs.forEach(b => {
      if (!b.slug) return;
      const lastmod = (b.createdAt || new Date()).toISOString().split('T')[0];
      xml += `
  <url>
    <loc>${SITE}/blog/${xmlEscape(b.slug)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`;
    });

    xml += '\n</urlset>';

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/xml',
        'Cache-Control': 'public, max-age=3600',
      },
      body: xml,
    };

  } catch (error) {
    console.error('getSitemap error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/plain' },
      body: 'Error generating sitemap: ' + error.message,
    };
  }
};
