// app.js - Complete with R2 Integration
import express from 'express';
import mongoose from 'mongoose';
import bodyParser from 'body-parser';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import authRoutes from './routes/auth.js';
import userRoutes from './routes/user.js';
import adminRoutes from './routes/admin.js';
import paymentRoutes from './routes/paymentRoutes.js';
import emailRoutes from './routes/emailRoutes.js';
import contactRoutes from './routes/contactRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import blogRoutes from './routes/blogRoutes.js';
import serviceRoutes from './routes/serviceRoutes.js';
import galleryRoutes from './routes/galleryRoutes.js';
import seoRoutes from './routes/seoRoutes.js';
import sitemapRoutes from './routes/sitemapRoutes.js';
import robotsRoutes from './routes/robotsRoutes.js';
import projectRoutes from './routes/projectRoutes.js';
import packageRoutes from './routes/packageRoutes.js';
import vehicleRoutes from './routes/vehicleRoutes.js';
import adminSEORoutes from './routes/adminSEORoutes.js';
import fleetRoutes from './routes/fleetRoutes.js';
import geoRoutes from './routes/geoRoutes.js';
import aeoRoutes from './routes/aeoRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import cron from 'node-cron';
import { checkScheduledBlogs } from './cron/checkScheduledBlogs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({
  path: path.join(__dirname, '.env')
});

const app = express();

// Trust first proxy (Nginx) so req.protocol returns https in production
app.set('trust proxy', 1);

// ============================================
// CORS Configuration
// ============================================
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS
      .split(',')
      .map(origin => origin.trim())
      .filter(Boolean)
  : [
      'http://localhost:4173',
      'http://localhost:4174',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5173',
      'http://localhost:5174'
    ];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) {
      return callback(null, true);
    }

    if (
      allowedOrigins.includes(origin) ||
      origin.includes('localhost')
    ) {
      return callback(null, true);
    }

    return callback(
      new Error(`CORS NOT ALLOWED: ${origin}`),
      false
    );
  },
  credentials: true,
  methods: [
    'GET',
    'POST',
    'PUT',
    'DELETE',
    'PATCH',
    'OPTIONS'
  ],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With'
  ],
  exposedHeaders: [
    'Content-Length',
    'X-Total-Count'
  ],
  maxAge: 86400
};

// ============================================
// Middleware
// ============================================
app.use(cors(corsOptions));

// Body parser middleware
app.use(bodyParser.json());
app.use(
  bodyParser.urlencoded({
    extended: true
  })
);

// ============================================
// Static Files - For backward compatibility
// ============================================
app.use(
  '/uploads',
  express.static(path.join(__dirname, 'uploads'))
);

// ============================================
// Database Connection
// ============================================
const MONGO_URI = process.env.MONGO_URI;

// Set global JWT_SECRET
global.JWT_SECRET = process.env.JWT_SECRET;

// Validate MongoDB URI
if (!MONGO_URI) {
  console.error('❌ MONGO_URI is missing');
  process.exit(1);
}

if (!/^mongodb(\+srv)?:\/\//.test(MONGO_URI)) {
  console.error('❌ Invalid MONGO_URI format');
  process.exit(1);
}

// Validate R2 Configuration (warn but don't exit)
if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID ||
    !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET_NAME) {
  console.warn('⚠️  R2 configuration is incomplete. Images will be saved locally.');
} else {
  console.log('✅ Cloudflare R2 configured successfully');
}

// ============================================
// Umami Analytics Configuration Check (warn only)
// ============================================
if (process.env.UMAMI_ENABLED === 'true') {
  if (!process.env.UMAMI_HOST || !process.env.UMAMI_WEBSITE_ID) {
    console.warn('⚠️  Umami Analytics is ENABLED but config is incomplete.');
  }
}

// Track DB connection state
let dbConnected = false;

// ============================================
// DB Connection Guard Middleware
// ============================================
app.use('/api', (req, res, next) => {
  if (!dbConnected) {
    return res.status(503).json({
      success: false,
      message: 'Database not connected. Please try again later.',
      code: 'DB_DISCONNECTED'
    });
  }
  next();
});

// ============================================
// Routes
// ============================================
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/admin/settings', settingsRoutes);
app.use('/api/blogs', blogRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/gallery', galleryRoutes);
app.use('/', sitemapRoutes);
app.use('/', robotsRoutes);
app.use('/api/seo', seoRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/packages', packageRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/seo-admin', adminSEORoutes);
app.use('/api/fleets', fleetRoutes);
app.use('/api/geo', geoRoutes);
app.use('/api/aeo', aeoRoutes);
app.use('/api/analytics', analyticsRoutes);

// ============================================
// Health Check Route
// ============================================
app.get('/', (req, res) => {
  res.json({
    message: 'E-commerce backend running',
    environment: process.env.NODE_ENV || 'development',
    r2Enabled: !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID),
    analyticsEnabled: process.env.UMAMI_ENABLED === 'true'
  });
});

// ============================================
// Database initialization function
// ============================================
export const initDB = async () => {
  try {
    if (mongoose.connection.readyState === 1) {
      dbConnected = true;
      return mongoose;
    }

    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 8000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 8000
    });

    dbConnected = true;
    console.log('✅ MongoDB connected successfully');

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️ MongoDB disconnected');
      dbConnected = false;
    });
    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB reconnected');
      dbConnected = true;
    });

    return mongoose;
  } catch (error) {
    dbConnected = false;
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// ============================================
// Cron Job Function
// ============================================
const startCronJob = () => {
  cron.schedule('0 * * * *', async () => {
    if (!dbConnected) {
      return;
    }

    try {
      await checkScheduledBlogs();
    } catch (error) {
      console.error('Cron job error:', error);
    }
  });

  console.log('⏰ Scheduled blog publisher cron job started (runs every hour)');

  setTimeout(async () => {
    if (!dbConnected) {
      return;
    }

    try {
      await checkScheduledBlogs();
    } catch (error) {
      console.error('Initial scheduled blog check error:', error);
    }
  }, 2000);
};

// ============================================
// Server Startup
// ============================================
const PORT = process.env.PORT || 5005;

const startServer = async () => {
  try {
    await initDB();
    startCronJob();

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();

// ============================================
// Error Handling Middleware
// ============================================
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err.stack);

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      message: 'File too large. Maximum size is 5MB.'
    });
  }

  res.status(500).json({
    success: false,
    message: process.env.NODE_ENV === 'development'
      ? err.message
      : 'Internal server error'
  });
});

// ============================================
// Handle Unhandled Promise Rejections
// ============================================
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

// ============================================
// Export app for testing
// ============================================
export default app;