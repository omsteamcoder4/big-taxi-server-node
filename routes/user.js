// appfolder/routes/user.js
import express from 'express';
import { getProfile } from '../controller/userController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.get('/me', protect, getProfile);

export default router;

