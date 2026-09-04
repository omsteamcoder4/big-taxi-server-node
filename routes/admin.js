// appfolder/routes/admin.js
import express from 'express';
import { getAllUsers, editUser, deleteUser, deactivateUser } from '../controller/adminController.js';
import { protect } from '../middleware/authMiddleware.js';
import { requireRole } from '../middleware/role.js';

const router = express.Router();

// protect + require admin role
router.use(protect);
router.use(requireRole(['admin']));

// list users (admin can see userpanel users)
router.get('/users', getAllUsers);

// admin actions on users
router.put('/users/:id', editUser);
router.delete('/users/:id', deleteUser);
router.patch('/users/:id/deactivate', deactivateUser);

export default router;
