// routes/settingsRoutes.js - ADD location routes
import express from 'express';
import { 
  getPublicSettings, 
  getAllSettings, 
  updateSettings,
  // Import location functions
  getLocations,
  addLocation,
  updateLocation,
  deleteLocation,
  setDefaultLocation,getLocationBySlug
} from '../controller/settingsController.js';
import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public route
router.get('/public', getPublicSettings);

// Admin routes
router.get('/', protect, authorize('admin'), getAllSettings);
router.put('/', protect, authorize('admin'), updateSettings);

// ADD LOCATION ROUTES
router.get('/locations', protect, authorize('admin'), getLocations);
router.post('/locations', protect, authorize('admin'), addLocation);
router.put('/locations/:id', protect, authorize('admin'), updateLocation);
router.delete('/locations/:id', protect, authorize('admin'), deleteLocation);
router.patch('/locations/:id/default', protect, authorize('admin'), setDefaultLocation);
router.get('/locations/slug/:slug', protect, authorize('admin'), getLocationBySlug);
export default router;