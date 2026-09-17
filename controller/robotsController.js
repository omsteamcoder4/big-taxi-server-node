// server/controller/robotsController.js
export const generateRobotsTxt = async (req, res) => {
  try {
    console.log('✅ robots.txt requested');

    const protocol = req.protocol;
    const host = req.get('host');
    const backendUrl = `${protocol}://${host}`;

    const isProduction = process.env.NODE_ENV === 'production';

    console.log(`📍 Generating robots.txt for backend URL: ${backendUrl}`);

    let robotsTxt = '';

    if (!isProduction) {
      robotsTxt = `# robots.txt for Development Environment
# Served from: ${backendUrl}

User-agent: *
Allow: /

# Prevent indexing in development
Disallow: /admin/
Disallow: /api/
Disallow: /dashboard/
Disallow: /login/
Disallow: /register/

# Sitemap location
Sitemap: ${backendUrl}/sitemap.xml

Crawl-delay: 2
Host: ${backendUrl.replace(/^https?:\/\//, '')}`;
    } else {
      robotsTxt = `# robots.txt for Production
# Generated for optimal SEO performance
# Last updated: ${new Date().toISOString()}

User-agent: *
Allow: /

# Allow public SEO endpoints (used by frontend + social preview bots)
Allow: /api/seo/page/*

# Disallow sensitive/admin areas
Disallow: /admin/
Disallow: /api/
Disallow: /dashboard/
Disallow: /login/
Disallow: /register/

# Allow important pages
Allow: /$
Allow: /about$
Allow: /services$
Allow: /fleet$
Allow: /fleet/*
Allow: /contact$
Allow: /booking$

# Sitemap location
Sitemap: ${backendUrl}/sitemap.xml

Crawl-delay: 1

# Googlebot specific
User-agent: Googlebot
Allow: /
Crawl-delay: 1

# Bingbot specific
User-agent: Bingbot
Allow: /
Crawl-delay: 1

# Mobile bots
User-agent: Googlebot-Mobile
Allow: /`;
    }

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    console.log(`✅ robots.txt generated for ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
    res.send(robotsTxt);

  } catch (error) {
    console.error('❌ Error generating robots.txt:', error);

    const protocol = req.protocol;
    const host = req.get('host');
    const backendUrl = `${protocol}://${host}`;
    const fallbackRobots = `# robots.txt - Fallback
User-agent: *
Allow: /

Sitemap: ${backendUrl}/sitemap.xml`;

    res.setHeader('Content-Type', 'text/plain');
    res.status(200).send(fallbackRobots);
  }
};

export const getRobotsStatus = async (req, res) => {
  try {
    const isProduction = process.env.NODE_ENV === 'production';
    const protocol = req.protocol;
    const host = req.get('host');
    const backendUrl = `${protocol}://${host}`;

    res.json({
      success: true,
      environment: process.env.NODE_ENV || 'development',
      isProduction,
      robotsUrl: `${backendUrl}/robots.txt`,
      sitemapUrl: `${backendUrl}/sitemap.xml`,
      timestamp: new Date().toISOString(),
      message: isProduction ? 'Robots.txt allows crawling' : 'Robots.txt restricts crawling for development'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};