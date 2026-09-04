// routes/serviceRoutes.js - FIXED ORDER + AI ROUTES
import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  getAllServices,
  getServiceById,
  getServiceBySlug,
  createService,
  updateService,
  deleteService,
  aiGenerateServiceFromChat,
  aiImproveService,
  aiGenerateServiceImage
} from '../controller/serviceController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

const tempUploadDir = path.join(os.tmpdir(), 'service-uploads');
if (!fs.existsSync(tempUploadDir)) {
  fs.mkdirSync(tempUploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, tempUploadDir),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}${path.extname(file.originalname)}`;
    cb(null, unique);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|webp|gif/;
  if (allowed.test(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed (JPEG, PNG, WEBP, GIF)'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: fileFilter,
});

const uploadFields = upload.fields([
  { name: 'image', maxCount: 1 }
]);

// ============================================
// AI ROUTES - MUST BE BEFORE DYNAMIC ROUTES
// ============================================

// Generate service from chat description
router.post('/ai/generate-from-chat', protect, authorize('admin'), aiGenerateServiceFromChat);

// Improve existing service content
router.post('/ai/improve', protect, authorize('admin'), aiImproveService);

// Generate service image
router.post('/ai/generate-image', protect, authorize('admin'), aiGenerateServiceImage);

// ============================================
// PUBLIC ROUTES (No authentication required)
// ============================================

// Get all services (with optional filters)
router.get('/', getAllServices);

// ⚠️ IMPORTANT: /slug/:slug must come BEFORE /:id
// Get service by slug
router.get('/slug/:slug', getServiceBySlug);

// Get service by ID (fallback - this will catch any non-slug requests)
router.get('/:id', getServiceById);

// ============================================
// ADMIN ROUTES (Authentication required)
// ============================================

// Create new service (admin only)
router.post('/', protect, authorize('admin'), uploadFields, createService);

// Update existing service (admin only)
router.put('/:id', protect, authorize('admin'), uploadFields, updateService);

// Delete service (admin only)
router.delete('/:id', protect, authorize('admin'), deleteService);

export default router;