// server/controller/sitemapController.js
import Fleet from '../models/FleetModel.js';
import Service from '../models/ServiceModel.js';
import Blog from '../models/Blog.js';

export const generateSitemap = async (req, res) => {
  try {
    // Use FRONTEND_URL from .env for client URLs
    const clientUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const apiBaseUrl = `${req.protocol}://${req.get('host')}`;

    console.log(`📍 Generating sitemap with client URL: ${clientUrl}`);

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

    console.log(`📊 Sitemap Data:
      Fleets: ${fleets.length} (with individual pages)
      Services: ${services.length} (images only, no individual pages)
      Blogs: ${blogs.length}`);

    const urls = [];

    // 1. Static pages
    staticPages.forEach(page => {
      urls.push({
        url: `${clientUrl}${page.url}`,
        lastmod: new Date(),
        priority: page.priority,
        changefreq: page.changefreq
      });
    });

    // 2. Fleets - Individual pages (with slugs)
    fleets.forEach(fleet => {
      const identifier = fleet.slug || fleet._id.toString();
      const imageUrl = fleet.image ? `${apiBaseUrl}${fleet.image}` : null;
      
      urls.push({
        url: `${clientUrl}/fleet/${identifier}`,
        lastmod: fleet.updatedAt || fleet.createdAt,
        priority: 0.8,
        changefreq: 'weekly',
        image: imageUrl,
        title: fleet.type
      });
    });

    // 3. Services - ONLY IMAGES, NO INDIVIDUAL PAGES
    // Add service images to the services listing page
    services.forEach(service => {
      const imageUrl = service.image ? `${apiBaseUrl}${service.image}` : null;
      
      // Only add if there's an image
      if (imageUrl) {
        urls.push({
          url: `${clientUrl}/services`,  // Link to services listing page
          lastmod: service.updatedAt || service.createdAt,
          priority: 0.6,
          changefreq: 'weekly',
          image: imageUrl,
          title: service.title,
          description: service.description
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
          changefreq: 'weekly'
        });
      }
    });

    // Generate XML with image support
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
  
  // Add image tag if image exists
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
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(sitemap);

    console.log(`✅ Sitemap generated with ${urls.length} URLs`);
    console.log(`   - ${staticPages.length} static pages`);
    console.log(`   - ${fleets.length} fleet pages`);
    console.log(`   - ${services.length} service images (on /services page)`);
    console.log(`   - ${blogs.length} blog pages`);
  } catch (error) {
    console.error('❌ Sitemap Error:', error);
    res.status(500).send('Error generating sitemap');
  }
};

// Helper to escape XML special characters
function escapeXml(unsafe) {
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
}