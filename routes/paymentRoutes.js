import express from 'express';
import {
  createRazorpayOrder,
  verifyPayment,
  paymentFailed,
  getPaymentDetails,
  refundPayment,
  createGuestOrder,
  getGuestOrder,
  getRazorpayOrderDetails,
    updatePaymentStatus
} from '../controller/paymentController.js';
import { protect, admin } from '../middleware/authMiddleware.js';

const router = express.Router();

// Guest routes (no authentication required)
router.post('/guest-order', createGuestOrder);
router.get('/guest-order/:orderId', getGuestOrder);

// Payment routes (no authentication required for verification & failure)
router.post('/create-order', createRazorpayOrder);
router.post('/verify', verifyPayment);
router.post('/failed', paymentFailed);

// Protected routes
router.get('/:paymentId', protect, getPaymentDetails);
router.post('/:paymentId/refund', protect, admin, refundPayment);
router.post("/:orderId/getpaydetails",getRazorpayOrderDetails);
router.put('/:orderId/status', protect, admin, updatePaymentStatus);
export default router;