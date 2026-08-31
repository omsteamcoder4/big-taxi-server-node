import express from 'express';
import { 
  sendEmail, 
  sendOrderConfirmation, 
  sendOrderStatusUpdate,
  sendOrderCancellationNotification,
  testEmail
} from '../controller/emailController.js';
import { protect, admin } from '../middleware/authMiddleware.js';

const router = express.Router();

// @desc    Test email sending
// @route   POST /api/email/test
// @access  Private/Admin
router.post('/test', protect, admin, async (req, res) => {
  try {
    const { to, subject, message } = req.body;
    
    const result = await sendEmail(
      to, 
      subject || 'Test Email', 
      message || '<h1>Test Email</h1><p>This is a test email from your application.</p>'
    );

    res.json({
      success: true,
      message: 'Test email sent successfully',
      result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @desc    Resend order confirmation
// @route   POST /api/email/order-confirmation/:orderId
// @access  Private/Admin
router.post('/order-confirmation/:orderId', protect, admin, async (req, res) => {
  try {
    const result = await sendOrderConfirmation(req.params.orderId);
    
    res.json({
      success: true,
      message: 'Order confirmation email sent successfully',
      result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @desc    Send order status update
// @route   POST /api/email/order-status/:orderId
// @access  Private/Admin
router.put('/order-status/:orderId', protect, admin, async (req, res) => {
  try {
    const { oldStatus, newStatus } = req.body;
    
    // Find the order first
    const order = await Order.findById(req.params.orderId)
      .populate('user', 'name email')
      .populate('guestUser', 'name email phone')
      .populate('products.product', 'name price');
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Send status update email to customer
    const emailTemplate = emailTemplates.orderStatusUpdate(order, oldStatus, newStatus);
    const result = await sendEmail(
      order.isGuestOrder ? order.guestUser?.email : order.user?.email,
      emailTemplate.subject,
      emailTemplate.html
    );
    
    res.json({
      success: true,
      message: 'Order status update email sent successfully',
      result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @desc    Send order cancellation notification (Admin only)
// @route   POST /api/email/order-cancellation/:orderId
// @access  Private/Admin
router.post('/order-cancellation/:orderId', protect, admin, async (req, res) => {
  try {
    const { cancellationReason } = req.body;
    
    // Find the order
    const order = await Order.findById(req.params.orderId)
      .populate('user', 'name email')
      .populate('guestUser', 'name email phone')
      .populate('products.product', 'name price');
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Send cancellation notification to admin
    const result = await sendOrderCancellationNotification(
      order, 
      'admin', 
      cancellationReason || 'Admin initiated cancellation'
    );
    
    res.json({
      success: true,
      message: 'Order cancellation notification sent to admin',
      result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// @desc    Test email configuration
// @route   GET /api/email/test-config
// @access  Private/Admin
router.get('/test-config', protect, admin, testEmail);

export default router;