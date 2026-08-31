import express from 'express';
import {
  createBlog,
  getAllBlogs,
  getBlogBySlug,
  updateBlog,
  deleteBlog,
  toggleLike,
  getBlogCategories,
  getBlogTags,
  getRelatedBlogs,
  uploadBlogImage,
  getBlogById,
  // AI functions
  aiGenerateSEOMeta,
  aiGenerateTags,
  aiGenerateExcerpt,
  aiImproveContent,
  aiGenerateOutline,
  aiGenerateImage,
  aiGenerateOGImage,
  aiGenerateAllImages
} from '../controller/blogController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';
import upload from '../middleware/uploadMiddleware.js';

const router = express.Router();

// ============ PUBLIC ROUTES ============
router.get('/', getAllBlogs);
router.get('/categories', getBlogCategories);
router.get('/tags', getBlogTags);
router.get('/id/:id', getBlogById);
router.get('/:id/related', getRelatedBlogs);

// ============ AI ROUTES (Admin & Author only) ============
// IMPORTANT: AI routes MUST be defined BEFORE the /:slug route
// These routes need protect and authorize middleware
router.post('/ai/generate-seo', protect, authorize('admin', 'author'), aiGenerateSEOMeta);
router.post('/ai/generate-tags', protect, authorize('admin', 'author'), aiGenerateTags);
router.post('/ai/generate-excerpt', protect, authorize('admin', 'author'), aiGenerateExcerpt);
router.post('/ai/improve-content', protect, authorize('admin', 'author'), aiImproveContent);
router.post('/ai/generate-outline', protect, authorize('admin', 'author'), aiGenerateOutline);
router.post('/ai/generate-image', protect, authorize('admin', 'author'), aiGenerateImage);
router.post('/ai/generate-og-image', protect, authorize('admin', 'author'), aiGenerateOGImage);
router.post('/ai/generate-all-images', protect, authorize('admin', 'author'), aiGenerateAllImages);

// ============ DYNAMIC ROUTES (must be LAST) ============
// This route must be AFTER all specific routes like /ai/*
router.get('/:slug', getBlogBySlug);

// ============ PROTECTED ROUTES ============
router.use(protect);

// Like/Unlike
router.post('/:id/like', toggleLike);

// Admin/Author routes
router.use(authorize('admin', 'author'));

// Create blog - Accept ANY field name for image
router.post(
  '/',
  upload.any(),
  (req, res, next) => {
    console.log('📁 Files received:', req.files);
    
    if (req.files && req.files.length > 0) {
      req.file = req.files[0];
      console.log(`✅ Using file: ${req.file.originalname} (field: ${req.file.fieldname})`);
    }
    
    next();
  },
  uploadBlogImage,
  createBlog
);

// Update blog - Accept ANY field name for image
router.put(
  '/:id',
  upload.any(),
  (req, res, next) => {
    if (req.files && req.files.length > 0) {
      req.file = req.files[0];
    }
    next();
  },
  uploadBlogImage,
  updateBlog
);

// Delete blog
router.delete('/:id', deleteBlog);

export default router;