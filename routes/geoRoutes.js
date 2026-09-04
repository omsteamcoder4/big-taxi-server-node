// server/routes/geoRoutes.js
import express from 'express';
import {
    getGeoSettings,
    getAllGeoSettings,
    updateGeoSettings,
    generateGeoJsonLd,
    getAiPromptTemplate
} from '../controller/geoController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// ✅ PUBLIC ROUTES (no auth required)
router.get('/page/:pageType', getGeoSettings);
router.get('/json-ld/:pageType', generateGeoJsonLd);
router.get('/prompt/:pageType', getAiPromptTemplate);

// ✅ ADMIN ROUTES (require auth)
router.get('/', protect, authorize('admin'), getAllGeoSettings);
router.put('/:pageType', protect, authorize('admin'), updateGeoSettings);



export default router;