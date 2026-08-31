import express from 'express';
import {
  getSitemapPreview,
  getSitemapXML,
  getRobotsContent
} from '../controller/adminSEOController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes require admin authentication
router.use(protect, authorize('admin'));

// Get sitemap preview data
router.get('/sitemap-preview', getSitemapPreview);

// Download sitemap XML
router.get('/sitemap-download', getSitemapXML);

// Get robots.txt content
router.get('/robots-content', getRobotsContent);

export default router;