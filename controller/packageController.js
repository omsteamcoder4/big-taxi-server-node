import Package from '../models/Package.js';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const deleteImageFile = (imagePath) => {
  if (!imagePath) return;
  try {
    const fullPath = path.join(process.cwd(), imagePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      console.log('✅ Deleted package image:', fullPath);
    }
  } catch (err) {
    console.error('❌ Error deleting package image:', err);
  }
};

// Optimize single image to WebP under 40KB
const optimizeImageToWebP = async (fileBuffer, width = 800, height = 500) => {
  let quality = 80;
  let buffer = await sharp(fileBuffer)
    .resize(width, height, { fit: 'cover', withoutEnlargement: true })
    .webp({ quality, effort: 6 })
    .toBuffer();

  // Reduce quality until file size is below 40KB
  while (buffer.length / 1024 > 40 && quality > 20) {
    quality -= 10;
    buffer = await sharp(fileBuffer)
      .resize(width, height, { fit: 'cover', withoutEnlargement: true })
      .webp({ quality, effort: 6 })
      .toBuffer();
  }

  return { buffer, quality, sizeKB: (buffer.length / 1024).toFixed(1) };
};

const processImage = async (fileBuffer, oldImagePath = null) => {
  if (oldImagePath) deleteImageFile(oldImagePath);

  const uploadDir = path.join(process.cwd(), 'uploads/packages');
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  const filename = `package_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.webp`;
  const filepath = path.join(uploadDir, filename);

  const { buffer, quality, sizeKB } = await optimizeImageToWebP(fileBuffer, 800, 500);

  await fs.promises.writeFile(filepath, buffer);
  console.log(`✅ Saved package image: ${filename} (${sizeKB}KB, quality: ${quality})`);
  return `/uploads/packages/${filename}`;
};

const processMultipleImages = async (files) => {
  const uploadedImages = [];
  
  for (const file of files) {
    const uploadDir = path.join(process.cwd(), 'uploads/packages');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    const filename = `package_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.webp`;
    const filepath = path.join(uploadDir, filename);

    const { buffer, quality, sizeKB } = await optimizeImageToWebP(file.buffer, 800, 500);

    await fs.promises.writeFile(filepath, buffer);
    uploadedImages.push(`/uploads/packages/${filename}`);
    console.log(`✅ Saved gallery image: ${filename} (${sizeKB}KB, quality: ${quality})`);
  }
  
  return uploadedImages;
};

// GET all packages (public: only active, admin: include inactive via query)
export const getAllPackages = async (req, res) => {
  try {
    const { includeInactive } = req.query;
    const query = {};
    if (includeInactive !== 'true') query.active = true;

    const packages = await Package.find(query).sort({ displayOrder: 1, createdAt: -1 });
    res.json({ success: true, count: packages.length, data: packages });
  } catch (err) {
    console.error('Error in getAllPackages:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET single package by ID
export const getPackageById = async (req, res) => {
  try {
    const pkg = await Package.findById(req.params.id);
    if (!pkg) return res.status(404).json({ success: false, message: 'Package not found' });
    res.json({ success: true, data: pkg });
  } catch (err) {
    console.error('Error in getPackageById:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET single package by slug
export const getPackageBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const pkg = await Package.findOne({ slug, active: true });
    if (!pkg) return res.status(404).json({ success: false, message: 'Package not found' });
    res.json({ success: true, data: pkg });
  } catch (err) {
    console.error('Error in getPackageBySlug:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// CREATE package (admin only)
export const createPackage = async (req, res) => {
  try {
    console.log('📦 Creating package...');
    console.log('Request body:', req.body);
    console.log('Request files:', req.files ? Object.keys(req.files) : 'No files');

    const { 
      title, 
      destination, 
      callForPrice, 
      features, 
      isFeatured, 
      displayOrder, 
      active, 
      shortDescription, 
      detailedDescription 
    } = req.body;

    if (!title || !destination) {
      return res.status(400).json({ success: false, message: 'Title and destination are required' });
    }

    let imagePath = '';
    let galleryImages = [];

    // Handle file uploads
    if (req.files) {
      // Handle main image
      if (req.files.image && req.files.image[0]) {
        console.log('Processing main image...');
        imagePath = await processImage(req.files.image[0].buffer);
      }
      
      // Handle gallery images
      if (req.files.images && req.files.images.length > 0) {
        console.log(`Processing ${req.files.images.length} gallery images...`);
        galleryImages = await processMultipleImages(req.files.images);
      }
    }

    // Parse features
    let featuresArray = [];
    if (features) {
      if (Array.isArray(features)) {
        featuresArray = features;
      } else if (typeof features === 'string') {
        featuresArray = features.split(',').map(f => f.trim()).filter(f => f);
      }
    }

    // Generate slug from title
    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const packageData = {
      title: title.trim(),
      slug,
      destination: destination.trim(),
      callForPrice: callForPrice === 'true' || callForPrice === true,
      features: featuresArray,
      image: imagePath,
      images: galleryImages,
      shortDescription: shortDescription || '',
      detailedDescription: detailedDescription || '',
      isFeatured: isFeatured === 'true' || isFeatured === true,
      displayOrder: parseInt(displayOrder) || 0,
      active: active === 'false' ? false : true,
    };

    console.log('Creating package with data:', packageData);

    const pkg = await Package.create(packageData);
    
    console.log('✅ Package created successfully:', pkg._id);
    res.status(201).json({ success: true, message: 'Package created', data: pkg });
  } catch (err) {
    console.error('❌ Error in createPackage:', err);
    res.status(400).json({ success: false, message: err.message });
  }
};

// UPDATE package (admin only)
export const updatePackage = async (req, res) => {
  try {
    console.log('📦 Updating package...');
    console.log('Request params:', req.params);
    console.log('Request body:', req.body);
    console.log('Request files:', req.files ? Object.keys(req.files) : 'No files');

    const pkg = await Package.findById(req.params.id);
    if (!pkg) {
      return res.status(404).json({ success: false, message: 'Package not found' });
    }

    const { 
      title, 
      destination, 
      callForPrice, 
      features, 
      isFeatured, 
      displayOrder, 
      active, 
      shortDescription, 
      detailedDescription,
      removeImages
    } = req.body;

    // Update text fields
    if (title !== undefined) {
      pkg.title = title.trim();
      pkg.slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    }
    if (destination !== undefined) pkg.destination = destination.trim();
    if (callForPrice !== undefined) pkg.callForPrice = callForPrice === 'true' || callForPrice === true;
    if (isFeatured !== undefined) pkg.isFeatured = isFeatured === 'true' || isFeatured === true;
    if (displayOrder !== undefined) pkg.displayOrder = parseInt(displayOrder) || 0;
    if (active !== undefined) pkg.active = active === 'true' || active === true;
    if (shortDescription !== undefined) pkg.shortDescription = shortDescription;
    if (detailedDescription !== undefined) pkg.detailedDescription = detailedDescription;

    // Parse features
    if (features !== undefined) {
      if (Array.isArray(features)) {
        pkg.features = features;
      } else if (typeof features === 'string') {
        pkg.features = features.split(',').map(f => f.trim()).filter(f => f);
      }
    }

    // Handle file uploads
    if (req.files) {
      // Handle main image update
      if (req.files.image && req.files.image[0]) {
        console.log('Updating main image...');
        pkg.image = await processImage(req.files.image[0].buffer, pkg.image);
      }

      // Handle gallery images upload
      if (req.files.images && req.files.images.length > 0) {
        console.log(`Adding ${req.files.images.length} new gallery images...`);
        const newImages = await processMultipleImages(req.files.images);
        pkg.images = [...pkg.images, ...newImages];
      }
    }

    // Handle removal of gallery images
    if (removeImages) {
      const imagesToRemove = Array.isArray(removeImages) ? removeImages : [removeImages];
      console.log(`Removing ${imagesToRemove.length} gallery images...`);
      imagesToRemove.forEach(imgPath => {
        deleteImageFile(imgPath);
      });
      pkg.images = pkg.images.filter(img => !imagesToRemove.includes(img));
    }

    await pkg.save();
    console.log('✅ Package updated successfully:', pkg._id);
    res.json({ success: true, message: 'Package updated', data: pkg });
  } catch (err) {
    console.error('❌ Error in updatePackage:', err);
    res.status(400).json({ success: false, message: err.message });
  }
};

// DELETE package (admin only)
export const deletePackage = async (req, res) => {
  try {
    console.log('📦 Deleting package:', req.params.id);
    
    const pkg = await Package.findById(req.params.id);
    if (!pkg) {
      return res.status(404).json({ success: false, message: 'Package not found' });
    }

    // Delete main image
    if (pkg.image) deleteImageFile(pkg.image);
    
    // Delete all gallery images
    if (pkg.images && pkg.images.length > 0) {
      pkg.images.forEach(imgPath => deleteImageFile(imgPath));
    }
    
    await Package.findByIdAndDelete(req.params.id);
    console.log('✅ Package deleted successfully');
    res.json({ success: true, message: 'Package deleted successfully' });
  } catch (err) {
    console.error('❌ Error in deletePackage:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};