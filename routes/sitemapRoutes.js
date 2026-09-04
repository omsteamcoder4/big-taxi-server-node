import express from 'express';
import { generateSitemap } from '../controller/sitemapController.js';

const router = express.Router();

// ✅ Main sitemap route
router.get('/sitemap.xml', generateSitemap);

// ✅ Add test route to verify router is working
router.get('/sitemap-test', (req, res) => {
  res.send('Sitemap routes are working!');
});

export default router;