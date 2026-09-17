// server/routes/analyticsRoutes.js
import express from 'express';
import { getAnalyticsConfig } from '../controller/analyticsController.js';

const router = express.Router();

// Public route — no auth required (returns only public config)
router.get('/config', getAnalyticsConfig);

export default router;