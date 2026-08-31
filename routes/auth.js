// routes/authRoutes.js
import express from 'express';
import { register, login, getProfile,forgotPassword, 
  resetPassword 
 } from '../controller/authcontroller.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/profile', protect, getProfile);
// router.post('/set-guest-password', setGuestPassword);

router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

export default router;
