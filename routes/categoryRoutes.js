// routes/categoryRoutes.js
import express from 'express';
import multer from 'multer';
import {
    createCategory,
    getAllCategories,
    getCategoryById,
    updateCategory,
    deleteCategory,
    getCategoriesTree,
    getCategoryProducts,
    getActiveCategories  
} from '../controller/categoryController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// Configure multer for image upload
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(file.originalname.toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

// ✅ Public Routes - STATIC ROUTES FIRST
router.get('/', getAllCategories); // GET /api/categories
router.get('/tree', getCategoriesTree); // GET /api/categories/tree
router.get('/active', getActiveCategories); // GET /api/categories/active

// ✅ DYNAMIC ROUTES LAST
router.get('/:id', getCategoryById); // GET /api/categories/:id
router.get('/:id/products', getCategoryProducts); // GET /api/categories/:id/products

// ✅ Admin-only Routes with Image Upload
router.post('/', protect, authorize('admin'), upload.single('image'), createCategory);
router.put('/:id', protect, authorize('admin'), upload.single('image'), updateCategory);
router.delete('/:id', protect, authorize('admin'), deleteCategory);

export default router;