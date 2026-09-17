// server/routes/robotsRoutes.js
import express from 'express';
import { generateRobotsTxt, getRobotsStatus } from '../controller/robotsController.js';

const router = express.Router();

// ✅ Main robots.txt route (must stay at root — crawlers expect /robots.txt)
router.get('/robots.txt', generateRobotsTxt);

// ✅ Admin endpoint — moved under /api for consistency
router.get('/api/robots-status', getRobotsStatus);

// ✅ Test route to verify router is working
router.get('/robots-test', (req, res) => {
  res.send('Robots routes are working!');
});

export default router;