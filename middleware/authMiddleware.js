// middleware/authMiddleware.js
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../models/userModel.js';

export const protect = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route'
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route'
      });
    }

    // ✅ FAIL FAST: If DB is down, return 503 immediately without retry
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database unavailable. Please try again later.',
        code: 'DB_DISCONNECTED'
      });
    }

    // ✅ FIX: Fetch full user from DB so req.user always has .role, ._id, etc.
    let user;
    try {
      user = await User.findById(decoded.id).select('-password');
    } catch (dbErr) {
      console.error('❌ DB error in auth:', dbErr.message);
      return res.status(503).json({
        success: false,
        message: 'Database unavailable. Please try again later.',
        code: 'DB_DISCONNECTED'
      });
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    // ✅ FIX: Check if account is still active
    if (user.active === false) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated'
      });
    }

    req.user = user; // Full Mongoose document: has ._id, .role, .email, etc.
    next();

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// ✅ Admin-only middleware
export const admin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({
      success: false,
      message: 'Access denied. Admin privileges required.'
    });
  }
};

// ✅ Role-based middleware generator
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized to access this route'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role '${req.user.role}' is not authorized to access this route`
      });
    }

    next();
  };
};

// ✅ Combined protect + admin shorthand
export const protectAndAdmin = [protect, admin];