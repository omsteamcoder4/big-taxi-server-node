// server/controller/adminSEOController.js
import Fleet from '../models/FleetModel.js';
import Service from '../models/ServiceModel.js';
import Blog from '../models/Blog.js';

// Helper function to get full image URL
const getFullImageUrl = (imagePath, baseUrl) => {
  if (!imagePath) return null;
  if (imagePath.startsWith('http')) return imagePath;
  const cleanPath = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;
  return `${baseUrl}${cleanPath}`;
};

// Helper function to escape XML special characters
const escapeXml = (unsafe) => {
  if (!unsafe) return '';
  return unsafe.replace(/[<>&'"]/g, function (c) {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
};

// Get sitemap preview data
export const getSitemapPreview = async (req, res) => {
  try {
    // Use FRONTEND_URL from .env for client URLs
    const clientUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const apiBaseUrl = `${req.protocol}://${req.get('host')}`;

    // Static pages
    const staticPages = [
      { url: '/', priority: 1.0, changefreq: 'daily' },
      { url: '/about', priority: 0.6, changefreq: 'monthly' },
      { url: '/services', priority: 0.8, changefreq: 'weekly' },
      { url: '/fleet', priority: 0.8, changefreq: 'weekly' },
      { url: '/contact', priority: 0.6, changefreq: 'monthly' },
      { url: '/booking', priority: 0.9, changefreq: 'weekly' }
    ];

    // Fetch dynamic content
    const [fleets, services, blogs] = await Promise.all([
      Fleet.find({ active: true }).select('type slug image updatedAt createdAt'),
      Service.find({ active: true }).select('title description image updatedAt createdAt features'),
      Blog.find({ status: 'published' }).select('slug updatedAt createdAt')
    ]);

    const urls = [];

    // 1. Static pages
    staticPages.forEach(page => {
      urls.push({
        url: `${clientUrl}${page.url}`,
        lastmod: new Date(),
        priority: page.priority,
        changefreq: page.changefreq,
        image: null,
        type: 'static'
      });
    });

    // 2. Fleets - Individual pages
    fleets.forEach(fleet => {
      const identifier = fleet.slug || fleet._id.toString();
      const imageUrl = getFullImageUrl(fleet.image, apiBaseUrl);
      
      urls.push({
        url: `${clientUrl}/fleet/${identifier}`,
        lastmod: fleet.updatedAt || fleet.createdAt,
        priority: 0.8,
        changefreq: 'weekly',
        image: imageUrl,
        title: fleet.type,
        type: 'fleet'
      });
    });

    // 3. Services - ONLY IMAGES, NO INDIVIDUAL PAGES
    // Each service image is added to the /services page
    services.forEach(service => {
      const imageUrl = getFullImageUrl(service.image, apiBaseUrl);
      
      // Only add if there's an image
      if (imageUrl) {
        urls.push({
          url: `${clientUrl}/services`,  // Link to services listing page
          lastmod: service.updatedAt || service.createdAt,
          priority: 0.6,
          changefreq: 'weekly',
          image: imageUrl,
          title: service.title,
          description: service.description,
          type: 'service_image'
        });
      }
    });

    // 4. Blogs - Individual pages
    blogs.forEach(blog => {
      if (blog.slug) {
        urls.push({
          url: `${clientUrl}/blog/${blog.slug}`,
          lastmod: blog.updatedAt || blog.createdAt,
          priority: 0.7,
          changefreq: 'weekly',
          image: null,
          type: 'blog'
        });
      }
    });

    res.json({
      success: true,
      data: {
        totalUrls: urls.length,
        urls: urls.slice(0, 100),
        summary: {
          staticPages: staticPages.length,
          fleets: fleets.length,
          serviceImages: services.filter(s => getFullImageUrl(s.image, apiBaseUrl)).length,
          blogs: blogs.length
        }
      }
    });
  } catch (error) {
    console.error('Error getting sitemap preview:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get sitemap XML (for download)
export const getSitemapXML = async (req, res) => {
  try {
    const clientUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const apiBaseUrl = `${req.protocol}://${req.get('host')}`;

    const staticPages = [
      { url: '/', priority: 1.0, changefreq: 'daily' },
      { url: '/about', priority: 0.6, changefreq: 'monthly' },
      { url: '/services', priority: 0.8, changefreq: 'weekly' },
      { url: '/fleet', priority: 0.8, changefreq: 'weekly' },
      { url: '/contact', priority: 0.6, changefreq: 'monthly' },
      { url: '/booking', priority: 0.9, changefreq: 'weekly' }
    ];

    const [fleets, services, blogs] = await Promise.all([
      Fleet.find({ active: true }).select('type slug image updatedAt createdAt'),
      Service.find({ active: true }).select('title description image updatedAt createdAt features'),
      Blog.find({ status: 'published' }).select('slug updatedAt createdAt')
    ]);

    const urls = [];

    // Static pages
    staticPages.forEach(page => {
      urls.push({
        url: `${clientUrl}${page.url}`,
        lastmod: new Date(),
        priority: page.priority,
        changefreq: page.changefreq,
        image: null
      });
    });

    // Fleets - Individual pages
    fleets.forEach(fleet => {
      const identifier = fleet.slug || fleet._id.toString();
      const imageUrl = getFullImageUrl(fleet.image, apiBaseUrl);
      
      urls.push({
        url: `${clientUrl}/fleet/${identifier}`,
        lastmod: fleet.updatedAt || fleet.createdAt,
        priority: 0.8,
        changefreq: 'weekly',
        image: imageUrl,
        title: fleet.type
      });
    });

    // Services - ONLY IMAGES (no individual pages)
    services.forEach(service => {
      const imageUrl = getFullImageUrl(service.image, apiBaseUrl);
      
      if (imageUrl) {
        urls.push({
          url: `${clientUrl}/services`,
          lastmod: service.updatedAt || service.createdAt,
          priority: 0.6,
          changefreq: 'weekly',
          image: imageUrl,
          title: service.title,
          description: service.description
        });
      }
    });

    // Blogs
    blogs.forEach(blog => {
      if (blog.slug) {
        urls.push({
          url: `${clientUrl}/blog/${blog.slug}`,
          lastmod: blog.updatedAt || blog.createdAt,
          priority: 0.7,
          changefreq: 'weekly',
          image: null
        });
      }
    });

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls.map(u => {
  let urlEntry = `
  <url>
    <loc>${escapeXml(u.url)}</loc>
    <lastmod>${new Date(u.lastmod).toISOString().split('T')[0]}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>`;
  
  if (u.image) {
    urlEntry += `
    <image:image>
      <image:loc>${escapeXml(u.image)}</image:loc>
      ${u.title ? `<image:title>${escapeXml(u.title)}</image:title>` : ''}
      ${u.description ? `<image:caption>${escapeXml(u.description.substring(0, 200))}</image:caption>` : ''}
    </image:image>`;
  }
  
  urlEntry += `
  </url>`;
  
  return urlEntry;
}).join('')}
</urlset>`;

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', 'attachment; filename="sitemap.xml"');
    res.send(sitemap);
  } catch (error) {
    console.error('Error generating sitemap XML:', error);
    res.status(500).send('Error generating sitemap');
  }
};

// Get robots.txt content
export const getRobotsContent = async (req, res) => {
  try {
    // Use backend URL for robots.txt and sitemap (where they are actually served from)
    const protocol = req.protocol;
    const host = req.get('host');
    const backendUrl = `${protocol}://${host}`; // This will be http://localhost:5004
    const clientUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    
    const isProduction = process.env.NODE_ENV === 'production';
    
    let robotsTxt = '';
    
    if (!isProduction) {
      robotsTxt = `# robots.txt for Development Environment
# Served from backend at: ${backendUrl}

User-agent: *
Allow: /

# Prevent indexing in development
Disallow: /admin/
Disallow: /api/
Disallow: /dashboard/
Disallow: /login/
Disallow: /register/

# Sitemap location (served from backend)
Sitemap: ${backendUrl}/sitemap.xml

Crawl-delay: 2
Host: ${backendUrl.replace(/^https?:\/\//, '')}`;
    } else {
      robotsTxt = `# robots.txt for Production
# Generated for optimal SEO performance
# Last updated: ${new Date().toISOString()}

User-agent: *
Allow: /

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

# Sitemap location (served from backend)
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
    
    res.json({
      success: true,
      data: {
        content: robotsTxt,
        isProduction,
        sitemapUrl: `${backendUrl}/sitemap.xml`,
        robotsUrl: `${backendUrl}/robots.txt`
      }
    });
  } catch (error) {
    console.error('Error getting robots content:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};