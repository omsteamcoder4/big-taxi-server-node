// server/routes/seoRoutes.js
import express from 'express';
import multer from 'multer';
import path from 'path';
import {
    getSeoByPage,
    createOrUpdateSeo,
    getAllSeo,
    deleteSeo,
    bulkUpdateSeo,
    getSeoStats,
    // AI functions
    aiGenerateSEOMeta,
    aiGenerateLocalSEO,
    aiGenerateScripts,
    aiGenerateImage,
    aiGenerateAll
} from '../controller/seoController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// Configure multer with memory storage
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|webp|gif/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Only .jpeg, .jpg, .png, .webp files are allowed'));
    }
});

// ============ PUBLIC ROUTES ============
router.get('/page/:pageType', getSeoByPage);
router.get('/page/:pageType/:identifier', getSeoByPage);

// ============ AI ROUTES (Admin only) ============
router.post('/ai/generate-seo', protect, authorize('admin'), aiGenerateSEOMeta);
router.post('/ai/generate-local-seo', protect, authorize('admin'), aiGenerateLocalSEO);
router.post('/ai/generate-scripts', protect, authorize('admin'), aiGenerateScripts);
router.post('/ai/generate-image', protect, authorize('admin'), aiGenerateImage);
router.post('/ai/generate-all', protect, authorize('admin'), aiGenerateAll);

// ============ ADMIN ROUTES ============
router.get('/', protect, authorize('admin'), getAllSeo);
router.get('/stats', protect, authorize('admin'), getSeoStats);
router.post('/', protect, authorize('admin'), upload.single('ogImage'), createOrUpdateSeo);
router.put('/', protect, authorize('admin'), upload.single('ogImage'), createOrUpdateSeo);
router.delete('/:id', protect, authorize('admin'), deleteSeo);
router.post('/bulk', protect, authorize('admin'), bulkUpdateSeo);

export default router;