// routes/fleetRoutes.js - With AI Routes and R2
import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  getAllFleets,
  getFleetById,
  getFleetBySlug,
  createFleet,
  updateFleet,
  deleteFleet,
  aiGenerateFleetFromChat,
  aiImproveFleet,
  aiGenerateFleetImage
} from '../controller/fleetController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

const tempUploadDir = path.join(os.tmpdir(), 'fleet-uploads');
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
  { name: 'image', maxCount: 1 },
  { name: 'images', maxCount: 10 }
]);

// ============================================
// AI ROUTES - MUST BE BEFORE DYNAMIC ROUTES
// ============================================

// Generate fleet from chat description
router.post('/ai/generate-from-chat', protect, authorize('admin'), aiGenerateFleetFromChat);

// Improve existing fleet content
router.post('/ai/improve', protect, authorize('admin'), aiImproveFleet);

// Generate fleet image
router.post('/ai/generate-image', protect, authorize('admin'), aiGenerateFleetImage);

// ============================================
// PUBLIC ROUTES (No authentication required)
// ============================================

router.get('/', getAllFleets);
router.get('/slug/:slug', getFleetBySlug);
router.get('/:id', getFleetById);

// ============================================
// ADMIN ROUTES (Authentication required)
// ============================================

router.post('/', protect, authorize('admin'), uploadFields, createFleet);
router.put('/:id', protect, authorize('admin'), uploadFields, updateFleet);
router.delete('/:id', protect, authorize('admin'), deleteFleet);

export default router;