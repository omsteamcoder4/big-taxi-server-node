import Razorpay from 'razorpay';
import crypto from 'crypto';
import dotenv from 'dotenv';
import User from '../models/userModel.js';
import Setting from '../models/Settings.js'; // ✅ ADD THIS
import bcrypt from 'bcryptjs';
import { emailTemplates, sendEmail, sendOrderConfirmation, sendOrderStatusUpdate, sendGuestPasswordEmail } from './emailController.js';
import shippingService from '../services/shippingService.js';

dotenv.config();

// ✅ MODIFIED: Create Razorpay instance dynamically using settings
const getRazorpayInstance = async () => {
  const settings = await Setting.getSettings();
  
  if (!settings.razorpayKeyId) {
    throw new Error('Razorpay key ID not configured in settings');
  }
  
  if (!settings.razorpayKeySecret) {
    throw new Error('Razorpay key secret not configured in settings');
  }
  
  return new Razorpay({
    key_id: settings.razorpayKeyId,
    key_secret: settings.razorpayKeySecret,
  });
};

/* -------------------------------------------------------------------------- */
/* 🧩 1. Create Razorpay order (for both guest & registered users)             */
/* -------------------------------------------------------------------------- */
export const createRazorpayOrder = async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ success: false, message: 'Order ID is required' });
    }

    // Find order (check both guest & registered)
    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (order.paymentStatus === 'completed') {
      return res.status(400).json({ success: false, message: 'Order already paid' });
    }

    // ✅ MODIFIED: Get Razorpay instance with settings
    const razorpay = await getRazorpayInstance();
    
    // Check if Razorpay is enabled in settings
    const settings = await Setting.findOne().lean();
    if (!settings.razorpayEnabled) {
      return res.status(400).json({
        success: false,
        message: 'Razorpay payments are currently disabled'
      });
    }

    // Create Razorpay order
    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(order.finalAmount * 100), 
      currency: 'INR',
      receipt: order.orderId,
      notes: {
        orderId: order.orderId,
        type: order.isGuestOrder ? 'guest' : 'user',
        ...(order.isGuestOrder
          ? { guestEmail: order.guestUser?.email }
          : { userId: order.user?.toString() }),
      },
    });

    // Save Razorpay details
    order.razorpayOrderId = razorpayOrder.id;
    order.paymentMethod = 'razorpay';
    await order.save();

    res.json({
      success: true,
      order: razorpayOrder,
      key: settings.razorpayKeyId, // ✅ Return key from settings
    });
  } catch (error) {
    console.error('Create Razorpay order error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/* -------------------------------------------------------------------------- */
/* 🧩 2. Verify Razorpay payment + update stock (for both guest & users)      */
/* -------------------------------------------------------------------------- */
export const verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'Missing payment verification data',
      });
    }

    const razorpay = await getRazorpayInstance();
    const settings = await Setting.getSettings();
    const generatedSignature = crypto
      .createHmac('sha256', settings.razorpayKeySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'Payment verification failed',
      });
    }

    // Find order by Razorpay order ID
    const order = await Order.findOne({ razorpayOrderId: razorpay_order_id })
      .populate('user', 'name email')
      .populate('guestUser', 'name email phone')
      .populate('products.product', 'name price stock');
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found for this payment',
      });
    }

    // Update stock only if not already deducted and payment is not completed
    if (order.paymentStatus !== 'completed') {
      for (const item of order.products) {
        if (item.product && item.product.stock >= item.quantity) {
          await Product.findByIdAndUpdate(item.product._id, {
            $inc: { stock: -item.quantity },
          });
          console.log(`Updated stock for ${item.product.name}: -${item.quantity}`);
        }
      }
    }

    // Store old status for invoice generation check
    const oldStatus = order.orderStatus;

    // Update payment details
    order.paymentId = razorpay_payment_id;
    order.paymentStatus = 'completed';
    order.orderStatus = 'confirmed';
    order.paidAt = new Date();

    // ✅ GENERATE INVOICE NUMBER WHEN ORDER IS CONFIRMED
    if (oldStatus !== 'confirmed' && !order.invoiceNumber) {
      console.log('🎯 CONDITION MET - Generating invoice now for payment verification');
      
      // ✅ GET SETTINGS FROM DATABASE
      const invoiceSettings = await Setting.findOne();
      
      const prefix = invoiceSettings?.invoicePrefix || 'TAN';
      const yearCode = invoiceSettings?.invoiceYearCode || '26';
      let nextSerial = invoiceSettings?.invoiceCurrentSerial || 1;
      
      console.log('Invoice settings for payment verification:', { prefix, yearCode, nextSerial });
      
      // Format serial with leading zeros (6 digits)
      const sequential = nextSerial.toString().padStart(6, '0');
      order.invoiceNumber = `${prefix}${yearCode}${sequential}`;
      
      // ✅ INCREMENT AND SAVE SERIAL IN SETTINGS
      if (invoiceSettings) {
        invoiceSettings.invoiceCurrentSerial = nextSerial + 1;
        await invoiceSettings.save();
        console.log('✅ Updated invoice serial in settings to:', invoiceSettings.invoiceCurrentSerial);
      }
      
      console.log('✅ Invoice number generated for payment verification:', order.invoiceNumber);
    }

    await order.save();

    // ✅ NEW: Handle guest user password creation and email
    if (order.isGuestOrder) {
      try {
        console.log('🎯 Processing guest user account creation');
        
        // Get guest email from various possible locations
        let guestEmail = '';
        
        // Try to get email from populated guestUser
        if (order.guestUser && order.guestUser.email) {
          guestEmail = order.guestUser.email;
          console.log('📧 Using email from guestUser:', guestEmail);
        }
        // Try to get email from shipping address (if you store it there)
        else if (order.shippingAddress && order.shippingAddress.email) {
          guestEmail = order.shippingAddress.email;
          console.log('📧 Using email from shipping address:', guestEmail);
        }
        // For createGuestOrder flow, check user reference
        else if (order.user) {
          // If order.user is populated, get email from there
          const userDoc = await User.findById(order.user);
          if (userDoc && userDoc.email) {
            guestEmail = userDoc.email;
            console.log('📧 Using email from user document:', guestEmail);
          }
        }
        
        if (guestEmail && guestEmail.includes('@')) {
          console.log(`📧 Found guest email: ${guestEmail}`);
          
          // Generate password
          const generatedPassword = generateGuestPassword(guestEmail);
          console.log(`🔑 Generated password: ${generatedPassword}`);
          
          // Hash the password before saving
          const salt = await bcrypt.genSalt(10);
          const hashedPassword = await bcrypt.hash(generatedPassword, salt);
          
          // Check if user already exists with this email
          let existingUser = await User.findOne({ email: guestEmail.toLowerCase() });
          
          if (existingUser) {
            console.log(`ℹ️ User already exists with email: ${guestEmail}`);
            
            // Update existing user - remove guest flag and set password
            existingUser.isGuest = false;
            existingUser.password = hashedPassword;
            existingUser.role = 'user';
            await existingUser.save();
            
            console.log(`✅ Updated existing user with new password`);
          } else {
            // Create new user account for guest
            const newUser = await User.create({
              name: order.guestUser?.name || 
                    order.shippingAddress?.fullName || 
                    order.shippingAddress?.name || 
                    'Guest Customer',
              email: guestEmail.toLowerCase(),
              phone: order.guestUser?.phone || order.shippingAddress?.phone || '',
              password: hashedPassword,
              isGuest: false,
              role: 'user',
              accountCreatedFromOrder: order.orderId
            });
            
            console.log(`✅ Created new user account for guest: ${newUser._id}`);
          }
          
          // Send password email to guest
          try {
            console.log(`📧 Attempting to send password email to guest: ${guestEmail}`);
            
            const emailResult = await sendGuestPasswordEmail(guestEmail, generatedPassword, order);
            
            if (emailResult.success) {
              console.log(`✅ Guest password email sent successfully to: ${guestEmail}`);
            } else {
              console.error(`❌ Guest password email failed:`, emailResult.error);
            }
          } catch (emailError) {
            console.error('❌ Guest password email failed with error:', emailError.message);
            console.error('Error stack:', emailError.stack);
            // Continue even if email fails
          }
        } else {
          console.warn('⚠️ No valid guest email found, skipping account creation');
        }
      } catch (guestError) {
        console.error('❌ Guest account creation failed:', guestError.message);
        console.error('Error stack:', guestError.stack);
        // Don't fail the payment verification if guest processing fails
      }
    }

    // 🚀 AUTO-CREATE SHIPMENT ON SHIPROCKET AFTER PAYMENT VERIFICATION
    let shipmentResult = null;
    try {
      console.log('🚀 Attempting to auto-create shipment for order:', order.orderId);
      
      // Import shipping service
      const shippingServiceModule = await import('../services/shippingService.js');
      
      // Create shipment using your existing shipping service
      const shipment = await shippingServiceModule.default.createShipment(order, {});
      
      if (shipment && shipment.shipment_id) {
        console.log('📦 ShipRocket shipment created successfully:', shipment.shipment_id);
        
        // Create shipping document in database
        const ShippingModel = await import('../models/shippingModel.js');
        
        const shippingData = {
          orderId: order.orderId,
          order: order._id,
          shipmentId: shipment.shipment_id.toString(),
          userType: order.isGuestOrder ? 'guest' : 'user',
          userId: order.isGuestOrder ? order.guestUser?._id : order.user?._id,
          pickupLocation: {},
          shippingStatus: 'pending',
          awbNumber: shipment.awb_code || null,
          courierName: shipment.courier_name || null,
          courierCompanyId: shipment.courier_company_id || null,
          shippingCharges: order.shippingAmount || 0,
          shipRocketResponse: shipment,
          labelUrl: shipment.label_url || null,
          manifestUrl: shipment.manifest_url || null
        };

        // Only add user field for registered users
        if (!order.isGuestOrder && order.user?._id) {
          shippingData.user = order.user._id;
        }

        const shippingDoc = await ShippingModel.default.create(shippingData);

        // Update order with shipment details
        order.shipmentId = shipment.shipment_id.toString();
        order.shippingStatus = shipment.status || 'pending';
        order.awbNumber = shipment.awb_code || null;
        order.courierName = shipment.courier_name || null;
        await order.save();

        shipmentResult = {
          shipmentId: shipment.shipment_id,
          awbNumber: shipment.awb_code,
          courierName: shipment.courier_name,
          status: shipment.status,
          labelUrl: shipment.label_url,
          manifestUrl: shipment.manifest_url
        };
        
        console.log('✅ Shipment created and order updated successfully');
      }
    } catch (shipmentError) {
      console.error('❌ Auto-shipment creation failed:', shipmentError.message);
      // Don't fail the payment verification if shipment creation fails
      // Just log the error and continue
      shipmentResult = {
        error: shipmentError.message,
        note: 'Shipment will need to be created manually'
      };
    }

    // Send regular order confirmation email (for both guest and registered users)
    try {
      const emailResult = await sendOrderConfirmation(order._id);
      
      if (!emailResult.userEmail || emailResult.userEmail.success === false) {
        console.warn('⚠️ Order confirmation email failed, but order was created successfully');
        console.log('Order details:', {
          orderId: order.orderId,
          amount: order.finalAmount,
          paymentStatus: order.paymentStatus,
          invoiceNumber: order.invoiceNumber
        });
      } else {
        console.log('✅ Order confirmation email sent successfully');
      }
    } catch (emailError) {
      console.error('❌ Email sending failed, but order was created:', emailError.message);
      // Don't throw - allow the payment to be successful even if email fails
    }

    // Populate order for response
    let populatedOrder;
    if (order.isGuestOrder) {
      populatedOrder = await Order.findById(order._id)
        .populate('guestUser', 'name email phone')
        .populate('products.product', 'name image price');
    } else {
      populatedOrder = await Order.findById(order._id)
        .populate('user', 'name email')
        .populate('products.product', 'name image price');
    }

    // Prepare response
    const response = {
      success: true,
      order: populatedOrder,
      message: 'Payment verified and order confirmed successfully',
      invoiceNumber: order.invoiceNumber // ✅ Include invoice number in response
    };

    // Add shipment info to response if available
    if (shipmentResult) {
      if (shipmentResult.error) {
        response.shipment = {
          success: false,
          message: 'Auto-shipment creation failed',
          error: shipmentResult.error,
          note: shipmentResult.note
        };
      } else {
        response.shipment = {
          success: true,
          message: 'Shipment created automatically',
          data: shipmentResult
        };
      }
    }

    res.json(response);
  } catch (error) {
    console.error('Verify payment error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* -------------------------------------------------------------------------- */
/* 🧩 3. Payment failed (for both guest & users)                              */
/* -------------------------------------------------------------------------- */
export const paymentFailed = async (req, res) => {
  try {
    const { razorpay_order_id } = req.body;
    const order = await Order.findOne({ razorpayOrderId: razorpay_order_id });

    if (order) {
      order.paymentStatus = 'failed';
      order.orderStatus = 'cancelled';
      await order.save();
    }

    res.json({
      success: false,
      message: 'Payment failed. Please try again.',
    });
  } catch (error) {
    console.error('Payment failed error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* -------------------------------------------------------------------------- */
/* 🧩 4. Get payment details                                                  */
/* -------------------------------------------------------------------------- */
export const getPaymentDetails = async (req, res) => {
  try {
    const razorpay = await getRazorpayInstance();
    const payment = await razorpay.payments.fetch(req.params.paymentId);
    res.json({ success: true, payment });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/* -------------------------------------------------------------------------- */
/* 🧩 5. Refund payment (with comprehensive validation)                       */
/* -------------------------------------------------------------------------- */
export const refundPayment = async (req, res) => {
  try {
    const { paymentId } = req.params;
    const { refund_amount } = req.body;

    console.log('🔁 Refund request:', { paymentId, refund_amount });

    if (!paymentId) {
      return res.status(400).json({ success: false, message: 'Payment ID missing' });
    }

    if (!refund_amount || refund_amount <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid refund amount' });
    }

    // ✅ MODIFIED: Get Razorpay instance with settings
    const razorpay = await getRazorpayInstance();
    
    const refund = await razorpay.payments.refund(paymentId, {
      amount: Math.round(refund_amount * 100),
    });

    const order = await Order.findOne({ paymentId });
    if (order) {
      order.paymentStatus = 'refunded';
      order.orderStatus = 'cancelled';
      await order.save();
    }

    return res.status(200).json({
      success: true,
      refund,
    });

  } catch (error) {
    console.error('❌ Razorpay refund error:', error);

    return res.status(500).json({
      success: false,
      message: error?.error?.description || error.message || 'Refund failed',
      razorpayError: error?.error || null, 
    });
  }
};

/* -------------------------------------------------------------------------- */
/* 🧩 6. Create guest order (COMPLETE FIXED VERSION WITH HSN CODE)            */
/* -------------------------------------------------------------------------- */
export const createGuestOrder = async (req, res) => {
  try {
    const {
      products,
      shippingAddress,
      guestUser,
      paymentMethod = 'razorpay'
    } = req.body;

    console.log('📦 Received guest order request:', {
      productCount: products?.length,
      guestEmail: guestUser?.email,
      paymentMethod,
      products: products
    });

    // Validate required fields
    if (!products || !Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Products are required and must be an array'
      });
    }

    if (!shippingAddress || !guestUser) {
      return res.status(400).json({
        success: false,
        message: 'Shipping address and guest user details are required'
      });
    }

    // Validate guest user has email
    if (!guestUser.email || !guestUser.email.includes('@')) {
      return res.status(400).json({
        success: false,
        message: 'Valid guest email is required'
      });
    }

    // Check if user already exists with this email
    let existingUser = await User.findOne({ email: guestUser.email.toLowerCase() });
    
    let userId;
    if (existingUser) {
      userId = existingUser._id;
      console.log('✅ Using existing user:', existingUser.email);
    } else {
      // Create a new user with guest role/flag
      const newUser = await User.create({
        name: guestUser.name || shippingAddress.fullName || 'Guest Customer',
        email: guestUser.email.toLowerCase(),
        phone: guestUser.phone || shippingAddress.phone || '',
        isGuest: true,
        role: 'guest'
      });
      userId = newUser._id;
      console.log('✅ Created new guest user:', guestUser.email);
    }

    // Calculate totals with proper variant handling INCLUDING WEIGHT AND HSN
    let totalAmount = 0;
    const orderProducts = [];

    console.log('🔄 Processing products:', products.length);

    for (const item of products) {
      console.log('📝 Processing product item:', {
        productId: item.product,
        variantId: item.variantId,
        variantName: item.variantName,
        price: item.price,
        quantity: item.quantity
      });

      // Find the product
      const product = await Product.findById(item.product);
      
      if (!product) {
        return res.status(400).json({
          success: false,
          message: `Product not found: ${item.product}`
        });
      }

      let price = item.price;
      let variantName = item.variantName || '';
      let variantId = item.variantId || null;
      let originalPrice = price;
      
      // ✅ HSN CODE: Initialize from product
      let hsnCode = product.hsnCode || '';
      
      // Weight handling
      let weight = 0;
      let weightUnit = 'gram';
      let variant = null;
      let sku = '';

      // Check if product has variants and if we're using a specific variant
      if (item.variantId && product.variants && product.variants.length > 0) {
        variant = product.variants.find(v => 
          v._id.toString() === item.variantId
        );
        
        if (variant) {
          // ✅ VARIANT: Use variant weight (only variants have weight)
          weight = variant.weight || 0;
          weightUnit = variant.weightUnit || 'gram';
          
          if (!item.variantName) {
            variantName = variant.variantName || '';
          }
          variantId = variant._id.toString();
          originalPrice = variant.originalPrice || variant.price || product.basePrice;
          sku = variant.sku || '';
          
          // ✅ HSN CODE: Get from variant if available, otherwise use product HSN
          if (variant.hsnCode) {
            hsnCode = variant.hsnCode;
            console.log(`📋 Using variant HSN code: ${hsnCode} for ${product.name} - ${variantName}`);
          } else {
            console.log(`📋 Using product HSN code: ${hsnCode} for ${product.name} - ${variantName}`);
          }
          
          // Check variant stock
          if (variant.stock < item.quantity) {
            return res.status(400).json({
              success: false,
              message: `Insufficient stock for ${product.name} - ${variantName}`
            });
          }
        }
      } else {
        // ✅ NON-VARIANT: Use product HSN
        hsnCode = product.hsnCode || '';
        console.log(`📋 Using product HSN code: ${hsnCode} for ${product.name}`);
        
        // Check base product stock (for non-variant purchases)
        if (product.stock < item.quantity) {
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for ${product.name}`
          });
        }
      }

      // If price is not provided in request, look it up
      if (typeof price !== 'number' || isNaN(price) || price <= 0) {
        console.log('💰 Price not provided in request, looking up from product/variant');
        
        if (variant) {
          price = variant.price || product.basePrice;
        } else {
          price = product.basePrice;
        }
      } else {
        console.log('✅ Using price from request:', price);
      }

      // Validate price
      if (typeof price !== 'number' || isNaN(price) || price <= 0) {
        console.error('❌ Invalid price for product:', {
          productId: product._id,
          productName: product.name,
          price,
          basePrice: product.basePrice
        });
        return res.status(400).json({
          success: false,
          message: `Invalid price for ${product.name}`
        });
      }

      const itemTotal = item.quantity * price;
      totalAmount += itemTotal;

      // Calculate discount percentage
      let discountPercentage = 0;
      if (originalPrice > price) {
        discountPercentage = Math.round(((originalPrice - price) / originalPrice) * 100);
      }

      const displayName = variantName 
        ? `${product.name} - ${variantName}`
        : product.name;

      // ✅ DEBUG: Log weight and HSN information
      console.log('🔍 Weight & HSN debug for guest order:', {
        product: product.name,
        variantSelected: !!variant,
        variantName: variantName,
        weight: weight,
        weightUnit: weightUnit,
        hsnCode: hsnCode || 'N/A'
      });

      orderProducts.push({
        product: product._id,
        variantId: variantId,
        variantName: variantName,
        // ✅ CORRECT: Only variants have weight, main products = 0
        weight: weight,
        weightUnit: weightUnit,
        quantity: item.quantity,
        price: price,
        originalPrice: originalPrice,
        discountPercentage: discountPercentage,
        name: displayName,
        image: product.images && product.images.length > 0 ? product.images[0].image : null,
        sku: sku,
        hsnCode: hsnCode // ✅ ADD HSN CODE TO ORDER PRODUCT
      });

      console.log('✅ Product added to order:', {
        displayName: displayName,
        variantName: variantName,
        price: price,
        quantity: item.quantity,
        weight: `${weight} ${weightUnit}`,
        hsnCode: hsnCode || 'N/A',
        itemTotal: itemTotal
      });
    }

    // Validate totalAmount
    if (isNaN(totalAmount) || totalAmount <= 0) {
      console.error('❌ Invalid total amount calculated:', totalAmount);
      return res.status(400).json({
        success: false,
        message: 'Invalid order total calculated'
      });
    }

    // Calculate shipping, tax, and final amount
    const shippingFee = 0; 
    const taxAmount = Math.round(totalAmount * 18) / 100;
    const finalAmount = totalAmount + shippingFee + taxAmount;

    console.log('💰 Amount calculations:', {
      totalAmount,
      shippingFee,
      taxAmount,
      finalAmount
    });

    // Check if selected payment method is enabled in settings
    const settings = await Setting.findOne().lean();
    
    if (paymentMethod === 'razorpay' && !settings.razorpayEnabled) {
      return res.status(400).json({
        success: false,
        message: 'Razorpay payments are currently disabled'
      });
    }
    
    if (paymentMethod === 'cod' && !settings.cashOnDeliveryEnabled) {
      return res.status(400).json({
        success: false,
        message: 'Cash on Delivery is currently disabled'
      });
    }

    // Create order
    const order = new Order({
      isGuestOrder: true,
      user: userId,
      guestUser: existingUser?._id || userId,
      products: orderProducts,
      shippingAddress: {
        ...shippingAddress,
        email: guestUser.email
      },
      paymentMethod,
      paymentStatus: paymentMethod === 'cod' ? 'pending' : 'pending',
      orderStatus: paymentMethod === 'cod' ? 'pending' : 'pending',
      totalAmount: Number(totalAmount.toFixed(2)),
      shippingFee: Number(shippingFee.toFixed(2)),
      taxAmount: Number(taxAmount.toFixed(2)),
      finalAmount: Number(finalAmount.toFixed(2)),
      subtotal: totalAmount,
      discountAmount: orderProducts.reduce((sum, item) => {
        if (item.originalPrice > item.price) {
          return sum + ((item.originalPrice - item.price) * item.quantity);
        }
        return sum;
      }, 0)
    });

    console.log('📄 Order before save (HSN CHECK):', {
      orderId: order.orderId,
      productsCount: order.products.length,
      totalAmount: order.totalAmount,
      finalAmount: order.finalAmount,
      taxAmount: order.taxAmount,
      products: order.products.map(p => ({
        name: p.name,
        variantName: p.variantName,
        price: p.price,
        weight: `${p.weight} ${p.weightUnit}`,
        hsnCode: p.hsnCode || 'N/A',
        quantity: p.quantity
      }))
    });

    // Save the order
    await order.save();

    console.log('✅ Order after save:', {
      orderId: order.orderId,
      sNo: order.sNo,
      finalAmount: order.finalAmount,
      taxAmount: order.taxAmount,
      products: order.products.map(p => ({
        name: p.name,
        variantName: p.variantName,
        price: p.price,
        weight: `${p.weight} ${p.weightUnit}`,
        hsnCode: p.hsnCode || 'N/A',
        quantity: p.quantity
      }))
    });

    // For COD payments, update stock immediately AND create user account
    if (paymentMethod === 'cod') {
      try {
        // Update stock for COD orders
        for (const item of orderProducts) {
          const product = await Product.findById(item.product);
          
          if (product) {
            if (item.variantId && product.variants && product.variants.length > 0) {
              const variantIndex = product.variants.findIndex(v => 
                v._id.toString() === item.variantId
              );
              
              if (variantIndex !== -1) {
                product.variants[variantIndex].stock -= item.quantity;
                const totalStock = product.variants.reduce((sum, variant) => sum + (variant.stock || 0), 0);
                product.stock = totalStock;
                await product.save();
                console.log(`📦 Updated variant stock for ${product.name}: -${item.quantity}`);
              }
            } else {
              product.stock -= item.quantity;
              await product.save();
              console.log(`📦 Updated product stock for ${product.name}: -${item.quantity}`);
            }
          }
        }

        // ✅ GENERATE INVOICE NUMBER FOR COD ORDER
        const invoiceSettings = await Setting.findOne();
        
        const prefix = invoiceSettings?.invoicePrefix || 'TAN';
        const yearCode = invoiceSettings?.invoiceYearCode || '26';
        let nextSerial = invoiceSettings?.invoiceCurrentSerial || 1;
        
        console.log('Invoice settings for COD guest order:', { prefix, yearCode, nextSerial });
        
        // Format serial with leading zeros (6 digits)
        const sequential = nextSerial.toString().padStart(6, '0');
        order.invoiceNumber = `${prefix}${yearCode}${sequential}`;
        
        // ✅ INCREMENT AND SAVE SERIAL IN SETTINGS
        if (invoiceSettings) {
          invoiceSettings.invoiceCurrentSerial = nextSerial + 1;
          await invoiceSettings.save();
          console.log('✅ Updated invoice serial in settings to:', invoiceSettings.invoiceCurrentSerial);
        }
        
        // ✅ IMPORTANT: Save the order AGAIN with invoice number!
        await order.save();
        
        console.log('✅ Invoice number generated and saved for COD guest order:', order.invoiceNumber);

        // ✅ CREATE USER ACCOUNT AND SEND PASSWORD FOR COD GUEST USERS
        try {
          console.log('🎯 Processing guest user account creation for COD order');
          
          let guestEmail = guestUser.email;
          
          if (guestEmail && guestEmail.includes('@')) {
            console.log(`📧 Found guest email for COD: ${guestEmail}`);
            
            // Generate password
            const generatedPassword = generateGuestPassword(guestEmail);
            console.log(`🔑 Generated password for COD: ${generatedPassword}`);
            
            // Hash the password
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(generatedPassword, salt);
            
            // Check if user already exists
            let existingUserCheck = await User.findOne({ email: guestEmail.toLowerCase() });
            
            if (existingUserCheck) {
              // Update existing user
              existingUserCheck.isGuest = false;
              existingUserCheck.password = hashedPassword;
              existingUserCheck.role = 'user';
              await existingUserCheck.save();
              console.log(`✅ Updated existing user with new password for COD`);
            } else {
              // Create new user
              const newUser = await User.create({
                name: guestUser.name || shippingAddress.fullName || 'Guest Customer',
                email: guestEmail.toLowerCase(),
                phone: guestUser.phone || shippingAddress.phone || '',
                password: hashedPassword,
                isGuest: false,
                role: 'user',
                accountCreatedFromOrder: order.orderId
              });
              console.log(`✅ Created new user account for COD guest: ${newUser._id}`);
            }
            
            // Send password email
            try {
              console.log(`📧 Attempting to send COD password email to: ${guestEmail}`);
              const emailResult = await sendGuestPasswordEmail(guestEmail, generatedPassword, order);
              
              if (emailResult.success) {
                console.log(`✅ COD guest password email sent successfully to: ${guestEmail}`);
              } else {
                console.error(`❌ COD guest password email failed:`, emailResult.error);
              }
            } catch (emailError) {
              console.error('❌ COD guest password email failed with error:', emailError.message);
            }
          } else {
            console.warn('⚠️ No valid guest email found for COD, skipping account creation');
          }
        } catch (accountError) {
          console.error('❌ Guest account creation failed for COD:', accountError.message);
        }

        // Send order confirmation email for COD
        try {
          await sendOrderConfirmation(order._id);
          console.log('📧 Order confirmation email sent for COD guest order');
        } catch (emailError) {
          console.error('❌ Order confirmation email failed:', emailError);
        }
      } catch (stockError) {
        console.error('❌ Stock update failed for COD order:', stockError);
      }
    }

    res.json({
      success: true,
      message: 'Guest order created successfully',
      order: {
        _id: order._id,
        orderId: order.orderId,
        finalAmount: order.finalAmount,
        paymentMethod: order.paymentMethod,
        requiresPayment: paymentMethod !== 'cod',
        invoiceNumber: order.invoiceNumber, // ✅ Include invoice number in response
        products: order.products.map(p => ({
          name: p.name,
          variantName: p.variantName,
          price: p.price,
          weight: `${p.weight} ${p.weightUnit}`,
          hsnCode: p.hsnCode || 'N/A',
          quantity: p.quantity
        }))
      }
    });

  } catch (error) {
    console.error('❌ Create guest order error:', error);
    
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      console.error('❌ Validation errors:', validationErrors);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }
    
    if (error.name === 'CastError') {
      console.error('❌ Cast error:', error.message);
      return res.status(400).json({
        success: false,
        message: 'Invalid data format',
        error: error.message
      });
    }
    
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};

/* -------------------------------------------------------------------------- */
/* 🧩 7. Get guest order by ID                                                */
// @desc    Get guest order details
// @route   GET /api/payments/guest-order/:id
// @access  Public
export const getGuestOrder = async (req, res) => {
  try {
    const { id } = req.params;

    // Find guest order by ID or Razorpay order ID
    const guestOrder = await GuestOrder.findOne({
      $or: [
        { _id: id },
        { razorpay_order_id: id }
      ]
    });

    if (!guestOrder) {
      return res.status(404).json({
        success: false,
        message: 'Guest order not found'
      });
    }

    // Get payment details from Razorpay if payment exists
    let paymentDetails = null;
    if (guestOrder.razorpay_payment_id) {
      try {
        const razorpay = await getRazorpayInstance();
        paymentDetails = await razorpay.payments.fetch(guestOrder.razorpay_payment_id);
      } catch (error) {
        console.error('Error fetching payment details:', error);
      }
    }

    res.status(200).json({
      success: true,
      guestOrder: {
        id: guestOrder._id,
        razorpay_order_id: guestOrder.razorpay_order_id,
        razorpay_payment_id: guestOrder.razorpay_payment_id,
        amount: guestOrder.amount,
        currency: guestOrder.currency,
        customer_name: guestOrder.customer_name,
        customer_email: guestOrder.customer_email,
        customer_phone: guestOrder.customer_phone,
        products: guestOrder.products,
        status: guestOrder.status,
        payment_details: paymentDetails,
        created_at: guestOrder.createdAt,
        updated_at: guestOrder.updatedAt
      }
    });
  } catch (error) {
    console.error('Get guest order error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching guest order',
      error: error.message
    });
  }
};

/* -------------------------------------------------------------------------- */
/* 🧩 8. Get Razorpay order details                                           */
/* -------------------------------------------------------------------------- */
export const getRazorpayOrderDetails = async (req, res) => {
  try {
    const { orderId } = req.params;
    console.log(req.params);
    
    const razorpay = await getRazorpayInstance();
    const razorpayOrder = await razorpay.orders.fetch(orderId);
    
    res.json({
      success: true,
      order: razorpayOrder
    });
  } catch (error) {
    console.error('Get Razorpay order error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/* -------------------------------------------------------------------------- */
/* 🧩 UTILITY: Generate guest password from email                              */
/* -------------------------------------------------------------------------- */
const generateGuestPassword = (email) => {
  try {
    if (!email || !email.includes('@')) {
      throw new Error('Invalid email address for password generation');
    }
    
    // Extract username part (before @)
    const usernamePart = email.split('@')[0];
    
    // Clean username - keep only letters and numbers, remove special characters
    const cleanUsername = usernamePart.replace(/[^a-zA-Z0-9]/g, '');
    
    // Take first 5 characters (or pad if shorter)
    let namePart;
    if (cleanUsername.length >= 5) {
      namePart = cleanUsername.substring(0, 5).toLowerCase();
    } else {
      // Pad with 'x' if username is shorter than 5 characters
      namePart = cleanUsername.toLowerCase();
      while (namePart.length < 5) {
        namePart += 'x';
      }
    }
    
    // Generate random number between 1 and 10
    const randomNum = Math.floor(Math.random() * 10) + 1;
    
    // Combine for exact 6 characters
    const password = namePart + randomNum;
    
    // Ensure it's exactly 6 characters (for cases where randomNum is 10)
    return password.substring(0, 6);
    
  } catch (error) {
    console.error('Password generation error:', error);
    // Fallback password
    return 'guest' + (Math.floor(Math.random() * 9) + 1);
  }
};

/* -------------------------------------------------------------------------- */
/* 🧩 9. Update Payment Status (Manual/Admin Update) - FINAL FIXED VERSION   */
/* -------------------------------------------------------------------------- */
/**
 * @desc    Update payment status manually (admin use)
 * @route   PUT /api/payments/:orderId/status
 * @access  Admin
 */
export const updatePaymentStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { 
      paymentStatus, 
      orderStatus, 
      notes,
      refundId,
      refundAmount,
      cancellationReason
    } = req.body;

    console.log('📝 Update payment status request:', {
      orderId,
      paymentStatus,
      orderStatus,
      refundId,
      refundAmount
    });

    // Validate required fields
    if (!paymentStatus && !orderStatus) {
      return res.status(400).json({
        success: false,
        message: 'At least one status (paymentStatus or orderStatus) is required'
      });
    }

    // Find the order
    const order = await Order.findOne({
      $or: [
        { orderId: orderId },
        { razorpayOrderId: orderId },
        { paymentId: orderId }
      ]
    })
      .populate('user', 'name email')
      .populate('guestUser', 'name email phone');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    const updateHistory = [];

    // ✅ Update payment status if provided
    if (paymentStatus) {
      const validPaymentStatus = ['pending', 'completed', 'failed', 'refunded', 'partially_refunded'];
      
      if (!validPaymentStatus.includes(paymentStatus)) {
        return res.status(400).json({
          success: false,
          message: `Invalid payment status. Valid values: ${validPaymentStatus.join(', ')}`
        });
      }

      const oldPaymentStatus = order.paymentStatus;
      
      // Special handling for refund status
      if (paymentStatus === 'refunded' || paymentStatus === 'partially_refunded') {
        if (!refundId) {
          refundId = `RFND-${Date.now()}-${order.orderId.substring(-6)}`;
          console.log('Generated refund ID:', refundId);
        }

        if (!order.refunds) {
          order.refunds = [];
        }
        
        order.refunds.push({
          refundId: refundId,
          amount: refundAmount || order.finalAmount,
          razorpayPaymentId: order.paymentId || 'N/A',
          type: paymentStatus === 'partially_refunded' ? 'partial' : 'full',
          createdAt: new Date(),
          notes: notes || `Status updated to ${paymentStatus} by admin`
        });
        
        order.markModified('refunds');

        // If full refund, update stock
        if (paymentStatus === 'refunded') {
          try {
            for (const item of order.products) {
              const product = await Product.findById(item.product);
              if (product) {
                if (item.variantId && product.variants?.length > 0) {
                  const variantIndex = product.variants.findIndex(v => 
                    v._id.toString() === item.variantId
                  );
                  if (variantIndex !== -1) {
                    product.variants[variantIndex].stock += item.quantity;
                    product.stock = product.variants.reduce((sum, v) => sum + (v.stock || 0), 0);
                    await product.save();
                  }
                } else {
                  product.stock += item.quantity;
                  await product.save();
                }
              }
            }
          } catch (stockError) {
            console.error('❌ Stock restoration failed:', stockError);
          }
        }
      }

      order.paymentStatus = paymentStatus;
      updateHistory.push(`Payment status changed from "${oldPaymentStatus}" to "${paymentStatus}"`);
    }

    // ✅ Update order status if provided
    if (orderStatus) {
      const validOrderStatus = [
        'pending', 'confirmed', 'processing', 'shipped', 
        'delivered', 'cancelled', 'refunded', 'partially_refunded'
      ];
      
      if (!validOrderStatus.includes(orderStatus)) {
        return res.status(400).json({
          success: false,
          message: `Invalid order status. Valid values: ${validOrderStatus.join(', ')}`
        });
      }

      const oldOrderStatus = order.orderStatus;
      
      // ✅ GENERATE INVOICE NUMBER WHEN ORDER IS CONFIRMED (ADMIN ACTION)
      if (orderStatus === 'confirmed' && oldOrderStatus !== 'confirmed' && !order.invoiceNumber) {
        const invoiceSettings = await Setting.findOne();
        
        const prefix = invoiceSettings?.invoicePrefix || 'TAN';
        const yearCode = invoiceSettings?.invoiceYearCode || '26';
        let nextSerial = invoiceSettings?.invoiceCurrentSerial || 1;
        
        console.log('Invoice settings for admin confirmation:', { prefix, yearCode, nextSerial });
        
        // Format serial with leading zeros (6 digits)
        const sequential = nextSerial.toString().padStart(6, '0');
        order.invoiceNumber = `${prefix}${yearCode}${sequential}`;
        
        // ✅ INCREMENT AND SAVE SERIAL IN SETTINGS
        if (invoiceSettings) {
          invoiceSettings.invoiceCurrentSerial = nextSerial + 1;
          await invoiceSettings.save();
          console.log('✅ Updated invoice serial in settings to:', invoiceSettings.invoiceCurrentSerial);
        }
        
        console.log('✅ Invoice number generated for admin confirmation:', order.invoiceNumber);
        updateHistory.push(`Invoice number generated: ${order.invoiceNumber}`);
      }
      
      // Handle cancellation
      if (orderStatus === 'cancelled' && order.orderStatus !== 'cancelled') {
        order.cancelledAt = new Date();
        order.cancelledBy = req.user?._id || null;
        order.cancellationReason = cancellationReason || notes || 'Cancelled by admin';
        
        // If order was paid, create refund record
        if (order.paymentStatus === 'completed' || order.paymentStatus === 'partially_refunded') {
          if (!order.refunds) {
            order.refunds = [];
          }
          
          order.refunds.push({
            refundId: `CANCEL-${Date.now()}-${order.orderId.substring(-6)}`,
            amount: order.finalAmount,
            razorpayPaymentId: order.paymentId || 'N/A',
            type: 'full',
            createdAt: new Date(),
            notes: `Order cancelled: ${order.cancellationReason}`
          });
          
          order.markModified('refunds');
          order.paymentStatus = 'refunded';
        }
        
        // Restore stock for cancelled orders
        if (order.paymentStatus === 'completed' || order.paymentStatus === 'pending') {
          try {
            for (const item of order.products) {
              const product = await Product.findById(item.product);
              if (product) {
                if (item.variantId && product.variants?.length > 0) {
                  const variantIndex = product.variants.findIndex(v => 
                    v._id.toString() === item.variantId
                  );
                  if (variantIndex !== -1) {
                    product.variants[variantIndex].stock += item.quantity;
                    product.stock = product.variants.reduce((sum, v) => sum + (v.stock || 0), 0);
                    await product.save();
                  }
                } else {
                  product.stock += item.quantity;
                  await product.save();
                }
              }
            }
          } catch (stockError) {
            console.error('❌ Stock restoration for cancellation failed:', stockError);
          }
        }
      }

      // Handle delivery
      if (orderStatus === 'delivered' && order.orderStatus !== 'delivered') {
        order.deliveredAt = new Date();
      }

      order.orderStatus = orderStatus;
      updateHistory.push(`Order status changed from "${oldOrderStatus}" to "${orderStatus}"`);
    }

    // Update notes if provided
    if (notes) {
      order.notes = order.notes ? `${order.notes}\n${new Date().toISOString()}: ${notes}` : notes;
    }

    // ✅ Save the updated order
    await order.save();

    // ✅ FIXED: Send status update email using direct email template (NOT calling sendOrderStatusUpdate)
    if (updateHistory.length > 0 && orderStatus) {
      try {
        console.log('📧 Preparing to send status update email for order:', order.orderId);
        
        // Get the customer email
        let customerEmail;
        let customerName;
        
        if (order.isGuestOrder) {
          customerEmail = order.guestUser?.email || order.shippingAddress?.email;
          customerName = order.guestUser?.name || order.shippingAddress?.fullName || 'Customer';
        } else {
          customerEmail = order.user?.email;
          customerName = order.user?.name || 'Customer';
        }
        
        if (!customerEmail) {
          console.warn('⚠️ No customer email found for order:', order.orderId);
        } else {
          console.log('📧 Sending status update email to:', customerEmail);
          
          // Extract old status from history
          const oldStatus = updateHistory[0].split('"')[1] || 'pending';
          
          // Create email template directly
          const emailTemplate = emailTemplates.orderStatusUpdate(
            order, 
            oldStatus, 
            orderStatus
          );
          
          // Send email directly
          const emailResult = await sendEmail(
            customerEmail,
            emailTemplate.subject,
            emailTemplate.html
          );
          
          if (emailResult.success) {
            console.log('✅ Status update email sent successfully to:', customerEmail);
          } else {
            console.error('❌ Status update email failed:', emailResult.error);
          }
        }
      } catch (emailError) {
        console.error('❌ Status update email error:', emailError.message);
        // Don't fail the request if email fails
      }
    }

    // Populate the updated order for response
    const updatedOrder = await Order.findById(order._id)
      .populate('user', 'name email')
      .populate('guestUser', 'name email phone')
      .populate('products.product', 'name price')
      .populate('cancelledBy', 'name email');

    res.json({
      success: true,
      message: 'Payment status updated successfully',
      updates: updateHistory,
      order: updatedOrder
    });

  } catch (error) {
    console.error('❌ Update payment status error:', error);
    
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: validationErrors
      });
    }
    
    res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};