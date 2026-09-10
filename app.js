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
import cron from 'node-cron';
import { checkScheduledBlogs } from './cron/checkScheduledBlogs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({
  path: path.join(__dirname, '.env')
});

const app = express();

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
// Keep this for any local uploads that might still exist
app.use(
  '/uploads',
  express.static(path.join(__dirname, 'uploads'))
);

// ============================================
// Response Middleware to handle R2 URLs
// ============================================
app.use((req, res, next) => {
  // Store original json and send methods
  const originalJson = res.json;
  const originalSend = res.send;
  
  // Override json method
  res.json = function(data) {
    // If data has image URLs that are local paths, keep them as is
    // R2 URLs are already full URLs, so we don't need to modify them
    // This middleware is mainly for backward compatibility
    return originalJson.call(this, data);
  };
  
  // Override send method for non-JSON responses
  res.send = function(data) {
    return originalSend.call(this, data);
  };
  
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

// ============================================
// Health Check Route
// ============================================
app.get('/', (req, res) => {
  res.json({
    message: 'E-commerce backend running',
    environment: process.env.NODE_ENV || 'development',
    r2Enabled: !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID)
  });
});

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
  console.error('Received:', MONGO_URI);
  process.exit(1);
}

// Validate R2 Configuration (warn but don't exit)
if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || 
    !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET_NAME) {
  console.warn('⚠️  R2 configuration is incomplete. Images will be saved locally.');
  console.warn('   To enable R2, add these variables to your .env file:');
  console.warn('   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME');
} else {
  console.log('✅ Cloudflare R2 configured successfully');
  console.log(`   Bucket: ${process.env.R2_BUCKET_NAME}`);
  console.log(`   Public URL: ${process.env.R2_PUBLIC_URL || 'https://<bucket>.r2.cloudflarestorage.com'}`);
}

// Database initialization function
export const initDB = async () => {
  try {
    if (mongoose.connection.readyState === 1) {
      return mongoose;
    }

    await mongoose.connect(MONGO_URI);

    console.log('✅ MongoDB connected successfully');
    return mongoose;
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

// ============================================
// Cron Job Function
// ============================================
const startCronJob = () => {
  // Run the cron job every minute to check for scheduled blogs
  cron.schedule('0 * * * *', async () => {
    try {
      await checkScheduledBlogs();
    } catch (error) {
      console.error('Cron job error:', error);
    }
  });

  console.log('⏰ Scheduled blog publisher cron job started (runs every minute)');

  // Run initial check immediately after database connection
  setTimeout(async () => {
    try {
      console.log('🔄 Running initial scheduled blog check...');
      await checkScheduledBlogs();
    } catch (error) {
      console.error('❌ Initial scheduled blog check error:', error);
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
    
    // ✅ START THE CRON JOB HERE
    startCronJob();

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🌐 CORS enabled for: ${allowedOrigins.join(', ')}`);
      
      // Log R2 status
      if (process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID) {
        console.log(`📦 R2 Storage: Enabled`);
        console.log(`   Bucket: ${process.env.R2_BUCKET_NAME}`);
      } else {
        console.log(`📁 Local Storage: Enabled (uploads folder)`);
      }
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();

// ============================================
// Error Handling Middleware (Optional)
// ============================================
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err.stack);
  
  // Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      message: 'File too large. Maximum size is 5MB.'
    });
  }
  
  // Other errors
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