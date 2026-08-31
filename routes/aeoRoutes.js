// server/routes/aeoRoutes.js
import express from 'express';
import {
    getAeoByPage,
    updateAeo,
    generateFAQSchema,
    generateHowToSchema,
    generateArticleSchema
} from '../controller/aeoController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public routes (for schema generation)
router.get('/faq/:pageType', generateFAQSchema);
router.get('/howto/:pageType', generateHowToSchema);
router.get('/article/:pageType', generateArticleSchema);

// Admin routes
router.get('/:pageType', protect, authorize('admin'), getAeoByPage);
router.put('/:pageType', protect, authorize('admin'), updateAeo);

export default router;