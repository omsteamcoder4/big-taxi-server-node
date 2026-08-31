// utils/r2Client.js - Complete R2 Client
import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

// ============================================
// Configuration
// ============================================
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;

// Check if R2 is configured
const isR2Configured = !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME);

if (!isR2Configured) {
  console.warn('⚠️  R2 not fully configured. Some features will be limited.');
}

// ============================================
// Create R2 Client (S3-compatible)
// ============================================
const r2Client = isR2Configured ? new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
}) : null;

// ============================================
// Upload to R2
// ============================================
export const uploadToR2 = async (fileBuffer, filename, contentType = 'image/webp', folder = 'services') => {
  if (!isR2Configured) {
    throw new Error('R2 is not configured. Please check your environment variables.');
  }

  try {
    // Clean filename - remove path separators and ensure safe characters
    const cleanFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    
    // Use folder structure: services/YYYY/MM/DD/filename
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const key = `${folder}/${year}/${month}/${day}/${cleanFilename}`;

    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    });

    await r2Client.send(command);
    
    // Return the public URL
    const publicUrl = `${R2_PUBLIC_URL || `https://${R2_BUCKET_NAME}.r2.cloudflarestorage.com`}/${key}`;
    console.log(`✅ Uploaded to R2: ${publicUrl}`);
    return publicUrl;
  } catch (error) {
    console.error('❌ Error uploading to R2:', error);
    throw new Error(`Failed to upload to R2: ${error.message}`);
  }
};

// ============================================
// Delete from R2
// ============================================
export const deleteFromR2 = async (fileUrl) => {
  if (!isR2Configured) {
    console.warn('⚠️  R2 not configured, skipping delete');
    return false;
  }

  try {
    // Extract the key from the URL
    const url = new URL(fileUrl);
    let key = url.pathname;
    
    // Remove leading slash if present
    if (key.startsWith('/')) {
      key = key.substring(1);
    }

    const command = new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    });

    await r2Client.send(command);
    console.log(`✅ Deleted from R2: ${fileUrl}`);
    return true;
  } catch (error) {
    console.error('❌ Error deleting from R2:', error);
    return false;
  }
};

// ============================================
// Check if file exists in R2
// ============================================
export const fileExistsInR2 = async (fileUrl) => {
  if (!isR2Configured) {
    return false;
  }

  try {
    const url = new URL(fileUrl);
    let key = url.pathname;
    if (key.startsWith('/')) {
      key = key.substring(1);
    }

    const command = new HeadObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    });

    await r2Client.send(command);
    return true;
  } catch (error) {
    if (error.name === 'NotFound') {
      return false;
    }
    console.error('❌ Error checking file existence:', error);
    return false;
  }
};

// ============================================
// List files in R2 (for admin purposes)
// ============================================
export const listFilesInR2 = async (prefix = 'services/', maxKeys = 100) => {
  if (!isR2Configured) {
    throw new Error('R2 is not configured.');
  }

  try {
    const command = new ListObjectsV2Command({
      Bucket: R2_BUCKET_NAME,
      Prefix: prefix,
      MaxKeys: maxKeys,
    });

    const response = await r2Client.send(command);
    return response.Contents || [];
  } catch (error) {
    console.error('❌ Error listing files in R2:', error);
    throw error;
  }
};

// ============================================
// Helper: Check R2 configuration status
// ============================================
export const getR2Status = () => {
  return {
    configured: isR2Configured,
    bucket: R2_BUCKET_NAME || 'Not set',
    publicUrl: R2_PUBLIC_URL || 'Not set',
    accountId: R2_ACCOUNT_ID ? 'Configured' : 'Not set',
  };
};

// ============================================
// Export client for advanced operations
// ============================================
export default r2Client;