// scripts/migrateToR2.js - Migrate existing images to R2
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

// Import models and utilities
import Service from '../models/ServiceModel.js';
import { uploadToR2, getR2Status } from '../utils/r2Client.js';

const migrateExistingImages = async () => {
  try {
    console.log('🚀 Starting migration to R2...');
    
    // Check R2 status
    const r2Status = getR2Status();
    console.log('R2 Status:', r2Status);
    
    if (!r2Status.configured) {
      console.error('❌ R2 is not configured. Please add R2 credentials to .env');
      process.exit(1);
    }

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // Get all services with images
    const services = await Service.find({ 
      image: { $ne: '', $exists: true } 
    });
    console.log(`📊 Found ${services.length} services with images`);

    let migrated = 0;
    let failed = 0;
    let skipped = 0;

    for (const service of services) {
      try {
        // Skip if already has R2 URL
        if (service.image.includes('r2.cloudflarestorage.com') || 
            service.image.includes('cloudflare') ||
            service.image.startsWith('https://')) {
          console.log(`⏭️  Skipping ${service.title} - already has remote URL`);
          skipped++;
          continue;
        }

        // Build local path
        const localPath = path.join(process.cwd(), service.image);
        
        // Check if file exists locally
        if (!fs.existsSync(localPath)) {
          console.log(`⚠️  File not found: ${localPath}`);
          failed++;
          continue;
        }

        // Read file
        const fileBuffer = fs.readFileSync(localPath);
        const filename = path.basename(service.image);
        
        // Upload to R2
        console.log(`📤 Uploading: ${service.title}...`);
        const publicUrl = await uploadToR2(fileBuffer, filename, 'image/webp', 'services');
        
        // Update service with new URL
        service.image = publicUrl;
        await service.save();
        
        console.log(`✅ Migrated: ${service.title}`);
        migrated++;
        
      } catch (error) {
        console.error(`❌ Failed to migrate ${service.title}:`, error.message);
        failed++;
      }
    }

    console.log('\n📊 Migration Summary:');
    console.log(`   ✅ Migrated: ${migrated}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   📊 Total: ${services.length}`);
    
    await mongoose.disconnect();
    console.log('✅ Migration complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
};

// Run migration
migrateExistingImages();