import express from 'express';
import multer from 'multer';
import {
  getAllPackages,
  getPackageById,
  getPackageBySlug,
  createPackage,
  updatePackage,
  deletePackage,
} from '../controller/packageController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// Configure multer for memory storage
const storage = multer.memoryStorage();

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
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit per file
  fileFilter: fileFilter,
});

// Handle multiple file uploads - use array for images and single for image
const uploadFields = upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'images', maxCount: 10 }
]);

// Public routes
router.get('/', getAllPackages);
router.get('/slug/:slug', getPackageBySlug);
router.get('/:id', getPackageById);

// Admin only routes
router.post('/', protect, authorize('admin'), uploadFields, createPackage);
router.put('/:id', protect, authorize('admin'), uploadFields, updatePackage);
router.delete('/:id', protect, authorize('admin'), deletePackage);

export default router;