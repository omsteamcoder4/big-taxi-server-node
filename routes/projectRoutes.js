// routes/projectRoutes.js
import express from 'express';
import multer from 'multer';
import {
  getAllProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject
} from '../controller/projectController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// Multer — memory storage so sharp can process buffer directly
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|gif/;
    if (allowed.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  }
});

// Public
router.get('/', getAllProjects);
router.get('/:id', getProjectById);

// Admin only
router.post('/', protect, authorize('admin'), upload.single('image'), createProject);
router.put('/:id', protect, authorize('admin'), upload.single('image'), updateProject);
router.delete('/:id', protect, authorize('admin'), deleteProject);

export default router;