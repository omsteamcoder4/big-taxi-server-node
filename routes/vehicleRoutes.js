import express from 'express';
import multer from 'multer';
import {
  getAllVehicles,
  getVehicleById,
  createVehicle,
  updateVehicle,
  deleteVehicle,
} from '../controller/vehicleController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|gif/;
    if (allowed.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

// Public routes
router.get('/', getAllVehicles);
router.get('/:id', getVehicleById);

// Admin only
router.post('/', protect, authorize('admin'), upload.single('image'), createVehicle);
router.put('/:id', protect, authorize('admin'), upload.single('image'), updateVehicle);
router.delete('/:id', protect, authorize('admin'), deleteVehicle);

export default router;