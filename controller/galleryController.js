
import Gallery from '../models/GalleryModel.js';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper function to delete image files
const deleteImageFile = (imagePath) => {
  if (!imagePath) return false;

  try {
    console.log('🔍 Attempting to delete gallery image:', imagePath);

    // Get the absolute path to your uploads folder
    const uploadsFolder = path.join(process.cwd(), 'uploads');

    // Extract the filename
    let filename = '';

    if (imagePath.includes('/uploads/')) {
      const parts = imagePath.split('/uploads/');
      filename = parts[parts.length - 1];
      filename = filename.replace(/^[/\\]+|[/\\]+$/g, '');
    } else {
      filename = path.basename(imagePath);
    }

    const exactFilePath = path.join(uploadsFolder, filename);

    if (fs.existsSync(exactFilePath)) {
      fs.unlinkSync(exactFilePath);
      console.log(`✅ DELETED gallery image: ${filename}`);
      return true;
    } else {
      console.log(`❌ Gallery image not found: ${filename}`);
      return false;
    }
  } catch (error) {
    console.error('❌ Error deleting gallery image file:', error);
    return false;
  }
};

export const createGallery = async (req, res) => {
    try {
        console.log('📥 Create Gallery Request');
        console.log('Body:', req.body);
        console.log('Files:', req.files);

        // With upload.fields(), req.files is an object with field names as keys
        const files = req.files || {};
        
        // Get main image from the 'image' field
        const mainImage = files.image ? files.image[0] : null;
        
        // Get OG image from the 'ogImage' field
        const ogImage = files.ogImage ? files.ogImage[0] : null;

        if (!mainImage) {
            return res.status(400).json({
                success: false,
                message: 'Image is required'
            });
        }

        console.log('✅ Main image uploaded:', mainImage.filename);
        if (ogImage) console.log('✅ OG image uploaded:', ogImage.filename);

        // Get form fields from req.body
        const { 
            altText, 
            caption, 
            title, 
            metaTitle, 
            metaDescription, 
            metaKeywords, 
            canonicalUrl, 
            ogTitle, 
            ogDescription, 
            status 
        } = req.body;

        // Process metaKeywords if it's a string
        let processedKeywords = [];
        if (metaKeywords) {
            if (typeof metaKeywords === 'string') {
                processedKeywords = metaKeywords.split(',').map(kw => kw.trim()).filter(kw => kw !== '');
            } else if (Array.isArray(metaKeywords)) {
                processedKeywords = metaKeywords;
            }
        }

        const gallery = new Gallery({
            image: `/uploads/${mainImage.filename}`,
            altText: altText || '',
            caption: caption || '',
            title: title || '',
            metaTitle: metaTitle || '',
            metaDescription: metaDescription || '',
            metaKeywords: processedKeywords,
            canonicalUrl: canonicalUrl || '',
            ogTitle: ogTitle || '',
            ogDescription: ogDescription || '',
            ogImage: ogImage ? `/uploads/${ogImage.filename}` : `/uploads/${mainImage.filename}`,
            status: status || 'active',
            createdBy: req.user?._id
        });

        const savedGallery = await gallery.save();

        console.log('✅ Gallery item created:', savedGallery._id);

        res.status(201).json({
            success: true,
            message: 'Gallery item created successfully',
            data: savedGallery
        });
    } catch (error) {
        console.error('❌ Create Gallery Error:', error);
        
        // Clean up uploaded files if save fails
        if (req.files) {
            const allFiles = [
                ...(req.files.image || []),
                ...(req.files.ogImage || [])
            ];
            
            allFiles.forEach(file => {
                try {
                    if (fs.existsSync(file.path)) {
                        fs.unlinkSync(file.path);
                        console.log(`🧹 Cleaned up: ${file.filename}`);
                    }
                } catch (unlinkError) {
                    console.warn(`⚠️ Could not delete ${file.path}:`, unlinkError.message);
                }
            });
        }
        
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

export const getAllGalleries = async (req, res) => {
    try {
        const { includeInactive } = req.query;
        
        let query = {};
        if (includeInactive !== 'true') {
            query.status = 'active';
        }

        const galleries = await Gallery.find(query).sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: galleries.length,
            data: galleries
        });
    } catch (error) {
        console.error('❌ Get Galleries Error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const getGalleryById = async (req, res) => {
    try {
        const { id } = req.params;
        
        let gallery;
        if (mongoose.Types.ObjectId.isValid(id)) {
            gallery = await Gallery.findById(id);
        }

        if (!gallery) {
            return res.status(404).json({
                success: false,
                message: 'Gallery item not found'
            });
        }

        res.status(200).json({
            success: true,
            data: gallery
        });
    } catch (error) {
        console.error('❌ Get Gallery Error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const updateGallery = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        const files = req.files || {};

        const gallery = await Gallery.findById(id);
        if (!gallery) {
            return res.status(404).json({
                success: false,
                message: 'Gallery item not found'
            });
        }

        // Handle main image update
        const mainImage = files.image ? files.image[0] : null;
        if (mainImage) {
            // Delete old image using helper function
            if (gallery.image) {
                console.log('🗑️ Deleting old main image:', gallery.image);
                deleteImageFile(gallery.image);
            }
            gallery.image = `/uploads/${mainImage.filename}`;
        }

        // Handle OG image update
        const ogImage = files.ogImage ? files.ogImage[0] : null;
        if (ogImage) {
            // Delete old OG image if it exists and is different from main image
            if (gallery.ogImage && gallery.ogImage !== gallery.image) {
                console.log('🗑️ Deleting old OG image:', gallery.ogImage);
                deleteImageFile(gallery.ogImage);
            }
            gallery.ogImage = `/uploads/${ogImage.filename}`;
        }

        // Handle OG image removal (if user clears it via URL or text)
        if (updates.ogImage !== undefined) {
            // If OG image is being set to null/empty or different URL
            if (!updates.ogImage || updates.ogImage === '' || updates.ogImage === 'null') {
                if (gallery.ogImage && gallery.ogImage !== gallery.image && gallery.ogImage.startsWith('/uploads/')) {
                    console.log('🗑️ Deleting OG image (removed by user):', gallery.ogImage);
                    deleteImageFile(gallery.ogImage);
                }
                gallery.ogImage = null;
            } 
            // If OG image is being set to a new URL (not file upload)
            else if (updates.ogImage !== gallery.ogImage && !updates.ogImage.startsWith('/uploads/')) {
                // Delete old local OG image if it exists
                if (gallery.ogImage && gallery.ogImage.startsWith('/uploads/') && gallery.ogImage !== gallery.image) {
                    console.log('🗑️ Deleting old OG image (replaced with URL):', gallery.ogImage);
                    deleteImageFile(gallery.ogImage);
                }
                gallery.ogImage = updates.ogImage;
            }
        }

        // Update text fields
        const textFields = [
            'altText', 'caption', 'title', 'metaTitle', 
            'metaDescription', 'canonicalUrl', 'ogTitle', 
            'ogDescription', 'status'
        ];

        textFields.forEach(field => {
            if (updates[field] !== undefined && updates[field] !== null) {
                gallery[field] = updates[field];
            }
        });

        // Handle metaKeywords separately
        if (updates.metaKeywords !== undefined) {
            if (typeof updates.metaKeywords === 'string') {
                gallery.metaKeywords = updates.metaKeywords.split(',').map(kw => kw.trim()).filter(kw => kw !== '');
            } else if (Array.isArray(updates.metaKeywords)) {
                gallery.metaKeywords = updates.metaKeywords;
            }
        }

        const updatedGallery = await gallery.save();

        res.status(200).json({
            success: true,
            message: 'Gallery item updated successfully',
            data: updatedGallery
        });
    } catch (error) {
        console.error('❌ Update Gallery Error:', error);
        
        // Clean up newly uploaded files if save fails
        if (req.files) {
            const allFiles = [
                ...(req.files.image || []),
                ...(req.files.ogImage || [])
            ];
            
            allFiles.forEach(file => {
                try {
                    if (fs.existsSync(file.path)) {
                        fs.unlinkSync(file.path);
                        console.log(`🧹 Cleaned up: ${file.filename}`);
                    }
                } catch (unlinkError) {
                    console.warn(`⚠️ Could not delete ${file.path}:`, unlinkError.message);
                }
            });
        }
        
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

export const deleteGallery = async (req, res) => {
    try {
        const { id } = req.params;

        const gallery = await Gallery.findById(id);
        if (!gallery) {
            return res.status(404).json({
                success: false,
                message: 'Gallery item not found'
            });
        }

        // ✅ Delete gallery images from upload folder before deleting from DB
        let deletedCount = 0;

        // Delete main image
        if (gallery.image) {
            console.log('🗑️ Deleting main gallery image:', gallery.image);
            if (deleteImageFile(gallery.image)) {
                deletedCount++;
            }
        }

        // Delete OG image if it exists and is different from main image
        if (gallery.ogImage && gallery.ogImage !== gallery.image && gallery.ogImage.startsWith('/uploads/')) {
            console.log('🗑️ Deleting OG image:', gallery.ogImage);
            if (deleteImageFile(gallery.ogImage)) {
                deletedCount++;
            }
        }

        // ✅ Now delete the gallery from database
        await Gallery.findByIdAndDelete(id);

        console.log(`✅ Total deleted: ${deletedCount} image files from upload folder`);
        console.log(`✅ Gallery deleted from database: ${id}`);

        res.status(200).json({
            success: true,
            message: `Gallery item deleted successfully. Removed ${deletedCount} image files from server.`,
            deletedImages: deletedCount
        });
    } catch (error) {
        console.error('❌ Delete Gallery Error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

export const getActiveGalleries = async (req, res) => {
    try {
        const galleries = await Gallery.find({ status: 'active' }).sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: galleries.length,
            data: galleries
        });
    } catch (error) {
        console.error('❌ Get Active Galleries Error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};