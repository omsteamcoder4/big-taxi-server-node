// controller/fleetController.js - R2 Integration with AI
import Fleet from '../models/FleetModel.js';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { uploadToR2, deleteFromR2 } from '../utils/r2Client.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Gemini AI - SAME AS BLOG CONTROLLER
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// JSON-mode model - SAME AS BLOG CONTROLLER
const modelJson = genAI.getGenerativeModel({
  model: "gemini-3.6-flash",
  generationConfig: {
    maxOutputTokens: 8192,
    responseMimeType: "application/json",
  }
});

// Plain-text model
const model = genAI.getGenerativeModel({ 
  model: "gemini-3.6-flash",
  generationConfig: {
    maxOutputTokens: 4096,
  }
});

// ============ R2 HELPER FUNCTIONS ============

/**
 * Check if a URL is an R2 URL
 */
const isR2Url = (url) => {
  if (!url) return false;
  return url.includes('r2.cloudflarestorage.com') || 
         url.includes('cloudflare') ||
         (url.startsWith('https://') && url.includes('.r2.'));
};

/**
 * Delete image from R2
 */
const deleteImageFromR2 = async (imageUrl) => {
  if (!imageUrl) return false;
  try {
    console.log('📤 Deleting from R2:', imageUrl);
    const result = await deleteFromR2(imageUrl);
    if (result) {
      console.log('✅ DELETED from R2:', imageUrl);
      return true;
    }
    return false;
  } catch (error) {
    console.error('❌ Error deleting from R2:', error);
    return false;
  }
};

/**
 * Upload image to R2
 */
const uploadFleetImageToR2 = async (tempFilePath, oldImageUrl = null, folder = 'fleets') => {
  try {
    if (oldImageUrl && isR2Url(oldImageUrl)) {
      await deleteImageFromR2(oldImageUrl);
    }

    const fileBuffer = await fs.promises.readFile(tempFilePath);
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const filename = `fleet_${timestamp}_${random}.webp`;
    
    const stats = fs.statSync(tempFilePath);
    console.log(`📤 Uploading fleet image to R2: ${filename} (${(stats.size / 1024).toFixed(2)}KB)`);

    const publicUrl = await uploadToR2(fileBuffer, filename, 'image/webp', folder);
    
    await fs.promises.unlink(tempFilePath).catch(() => {});
    
    console.log('✅ Fleet image uploaded to R2:', publicUrl);
    return publicUrl;
  } catch (error) {
    console.error('❌ Error uploading fleet image to R2:', error);
    await fs.promises.unlink(tempFilePath).catch(() => {});
    throw error;
  }
};

// ============ AI FLEET GENERATION FUNCTIONS ============

/**
 * Generate fleet vehicle from chat description
 */
const generateFleetFromChat = async (description) => {
  try {
    const prompt = `
      You are a professional vehicle fleet content creator. Based on the following description, create a complete vehicle entry.

      USER DESCRIPTION: "${description}"

      Generate a complete vehicle with:
      1. A vehicle type name (e.g., "Luxury Sedan", "Premium SUV", "Economy Hatchback") - under 40 chars
      2. A detailed, persuasive description (100-200 words) describing the vehicle
      3. A short description (30-60 words) for card previews
      4. Passenger capacity (e.g., "4 Passengers", "6 Passengers")
      5. Luggage capacity (e.g., "2 Bags", "4 Bags")
      6. 5-8 features (short, benefit-focused, under 10 words each)
      7. Ideal for (e.g., "Business Travel, Family Trips, Airport Transfers")
      8. SEO meta title (50-60 chars)
      9. SEO meta description (150-160 chars)

      The vehicle should sound professional, comfortable, and appealing to customers.
      Focus on comfort, safety, and convenience features.

      Return ONLY valid JSON in this exact format:
      {
        "type": "Vehicle Type Name",
        "description": "Detailed description...",
        "shortDescription": "Short description for cards",
        "capacity": "4 Passengers",
        "luggage": "2 Bags",
        "features": ["Feature 1", "Feature 2", "Feature 3"],
        "ideal": "Business Travel, Family Trips",
        "metaTitle": "SEO Meta Title",
        "metaDescription": "SEO Meta Description"
      }
    `;

    const result = await modelJson.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    try {
      return JSON.parse(text);
    } catch {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('AI response did not contain valid JSON');
    }
  } catch (error) {
    console.error('Error generating fleet from chat:', error);
    throw error;
  }
};

/**
 * Improve existing fleet content
 */
const improveFleetContent = async (currentContent, instruction) => {
  try {
    const prompt = `
      You are a professional vehicle fleet content editor. Improve the following vehicle content based on the instruction.

      CURRENT CONTENT:
      Type: ${currentContent.type || ''}
      Description: ${currentContent.description || ''}
      Short Description: ${currentContent.shortDescription || ''}
      Capacity: ${currentContent.capacity || ''}
      Luggage: ${currentContent.luggage || ''}
      Features: ${(currentContent.features || []).join(', ')}
      Ideal For: ${currentContent.ideal || ''}

      INSTRUCTION: ${instruction}

      Improve the content to make it more:
      - Professional and persuasive
      - Customer-focused
      - Benefit-driven
      - SEO-friendly

      Return ONLY valid JSON in this exact format:
      {
        "type": "Improved Vehicle Type",
        "description": "Improved Description",
        "shortDescription": "Improved Short Description",
        "capacity": "Improved Capacity",
        "luggage": "Improved Luggage Info",
        "features": ["Feature 1", "Feature 2"],
        "ideal": "Improved Ideal For",
        "metaTitle": "Improved Meta Title",
        "metaDescription": "Improved Meta Description"
      }
    `;

    const result = await modelJson.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    try {
      return JSON.parse(text);
    } catch {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('AI response did not contain valid JSON');
    }
  } catch (error) {
    console.error('Error improving fleet content:', error);
    throw error;
  }
};

/**
 * Generate AI image for fleet vehicle - SAME AS BLOG IMAGE GENERATION
 */
const generateFleetImage = async (type, description, model = 'flux', aspectRatio = 'featured') => {
  try {
    const promptText = description ? `${type} vehicle: ${description}` : type;
    const encodedPrompt = encodeURIComponent(promptText);
    
    const selectedModel = 'flux';
    
    let width, height;
    if (aspectRatio === 'square') {
      width = 400;
      height = 400;
    } else {
      width = 1200;
      height = 675;
    }
    
    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&model=${selectedModel}&nologo=true&enhance=true`;

    console.log(`🎨 Generating fleet image with Pollinations.ai (model: ${selectedModel})`);
    console.log(`📝 Prompt: ${promptText.substring(0, 100)}...`);
    console.log(`📐 Dimensions: ${width}x${height}`);

    const imageResponse = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 45000
    });

    const base64Data = Buffer.from(imageResponse.data, 'binary').toString('base64');
    const contentType = imageResponse.headers['content-type'] || 'image/jpeg';

    return {
      data: base64Data,
      mimeType: contentType,
      source: 'pollinations.ai',
      model: selectedModel,
      aspectRatio,
      width,
      height
    };
  } catch (error) {
    console.error('Fleet image generation error:', error);
    throw error;
  }
};

// ============ AI ROUTE HANDLERS ============

/**
 * AI: Generate fleet from chat description
 * POST /api/fleets/ai/generate-from-chat
 */
export const aiGenerateFleetFromChat = async (req, res) => {
  try {
    const { description } = req.body;

    if (!description || description.trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a description of the vehicle you want to create (minimum 3 characters)'
      });
    }

    const result = await generateFleetFromChat(description);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Fleet generation error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate fleet content'
    });
  }
};

/**
 * AI: Improve existing fleet content
 * POST /api/fleets/ai/improve
 */
export const aiImproveFleet = async (req, res) => {
  try {
    const { currentContent, instruction } = req.body;

    if (!currentContent) {
      return res.status(400).json({
        success: false,
        message: 'Current fleet content is required'
      });
    }

    if (!instruction || instruction.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an instruction for how to improve the content'
      });
    }

    const improved = await improveFleetContent(currentContent, instruction);

    res.json({
      success: true,
      data: improved
    });
  } catch (error) {
    console.error('Fleet improvement error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to improve fleet content'
    });
  }
};

/**
 * AI: Generate fleet image
 * POST /api/fleets/ai/generate-image
 */
export const aiGenerateFleetImage = async (req, res) => {
  try {
    const { type, description, model = 'flux' } = req.body;

    if (!type) {
      return res.status(400).json({
        success: false,
        message: 'Vehicle type is required'
      });
    }

    const image = await generateFleetImage(type, description, model, 'featured');

    res.json({
      success: true,
      data: image
    });

  } catch (error) {
    console.error('Fleet image generation error:', error);
    
    try {
      const { type } = req.body;
      console.log('🔄 Attempting fallback generation with turbo model...');
      
      const fallbackImage = await generateFleetImage(type, '', 'turbo', 'featured');
      
      return res.json({
        success: true,
        data: {
          ...fallbackImage,
          note: 'Generated with fallback model (turbo)'
        }
      });
    } catch (fallbackError) {
      console.error('Fallback generation also failed:', fallbackError);
      
      res.status(500).json({
        success: false,
        message: 'Failed to generate image: ' + error.message
      });
    }
  }
};

// ============ ORIGINAL CRUD FUNCTIONS (WITH R2) ============

// GET all fleets
export const getAllFleets = async (req, res) => {
  try {
    const { includeInactive } = req.query;
    const query = {};
    if (includeInactive !== 'true') query.active = true;

    const fleets = await Fleet.find(query).sort({ displayOrder: 1, createdAt: -1 });
    res.json({ success: true, count: fleets.length, data: fleets });
  } catch (err) {
    console.error('Error in getAllFleets:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET single fleet by ID
export const getFleetById = async (req, res) => {
  try {
    const fleet = await Fleet.findById(req.params.id);
    if (!fleet) return res.status(404).json({ success: false, message: 'Fleet not found' });
    res.json({ success: true, data: fleet });
  } catch (err) {
    console.error('Error in getFleetById:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET single fleet by slug
export const getFleetBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const fleet = await Fleet.findOne({ slug, active: true });
    if (!fleet) return res.status(404).json({ success: false, message: 'Fleet not found' });
    res.json({ success: true, data: fleet });
  } catch (err) {
    console.error('Error in getFleetBySlug:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// CREATE fleet (admin only) - WITH R2
export const createFleet = async (req, res) => {
  try {
    console.log('🚗 Creating fleet...');
    console.log('Request body:', req.body);
    console.log('Request files:', req.files ? Object.keys(req.files) : 'No files');

    const {
      type,
      description,
      shortDescription,
      capacity,
      luggage,
      features,
      ideal,
      displayOrder,
      active,
      metaTitle,
      metaDescription
    } = req.body;

    if (!type || !description || !capacity || !luggage) {
      return res.status(400).json({ success: false, message: 'Type, description, capacity, and luggage are required' });
    }

    let imagePath = '';
    let galleryImages = [];

    // Handle file uploads with R2
    if (req.files) {
      // Handle main image
      if (req.files.image && req.files.image[0]) {
        console.log('Processing main image to R2...');
        imagePath = await uploadFleetImageToR2(req.files.image[0].path, null, 'fleets');
      }

      // Handle gallery images
      if (req.files.images && req.files.images.length > 0) {
        console.log(`Processing ${req.files.images.length} gallery images to R2...`);
        for (const file of req.files.images) {
          try {
            const url = await uploadFleetImageToR2(file.path, null, 'fleets/gallery');
            galleryImages.push(url);
          } catch (err) {
            console.error('Failed to upload gallery image:', err);
          }
        }
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

    // Generate slug from type
    const slug = type
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const fleetData = {
      type: type.trim(),
      slug: slug,
      description: description.trim(),
      shortDescription: shortDescription || '',
      capacity: capacity.trim(),
      luggage: luggage.trim(),
      features: featuresArray,
      ideal: ideal || '',
      image: imagePath,
      images: galleryImages,
      displayOrder: parseInt(displayOrder) || 0,
      active: active === 'false' ? false : true,
      metaTitle: metaTitle || '',
      metaDescription: metaDescription || '',
    };

    console.log('Creating fleet with data:', fleetData);

    const fleet = await Fleet.create(fleetData);

    console.log('✅ Fleet created successfully:', fleet._id);
    res.status(201).json({ success: true, message: 'Fleet created', data: fleet });
  } catch (err) {
    console.error('❌ Error in createFleet:', err);
    res.status(400).json({ success: false, message: err.message });
  }
};

// UPDATE fleet (admin only) - WITH R2
export const updateFleet = async (req, res) => {
  try {
    console.log('🚗 Updating fleet:', req.params.id);

    const fleet = await Fleet.findById(req.params.id);
    if (!fleet) {
      return res.status(404).json({ success: false, message: 'Fleet not found' });
    }

    const {
      type,
      description,
      shortDescription,
      capacity,
      luggage,
      features,
      ideal,
      displayOrder,
      active,
      metaTitle,
      metaDescription,
      removeImages
    } = req.body;

    // Update text fields
    if (type !== undefined) {
      fleet.type = type.trim();
      fleet.slug = type
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    }
    if (description !== undefined) fleet.description = description.trim();
    if (shortDescription !== undefined) fleet.shortDescription = shortDescription;
    if (capacity !== undefined) fleet.capacity = capacity.trim();
    if (luggage !== undefined) fleet.luggage = luggage.trim();
    if (ideal !== undefined) fleet.ideal = ideal;
    if (displayOrder !== undefined) fleet.displayOrder = parseInt(displayOrder) || 0;
    if (active !== undefined) fleet.active = active === 'true' || active === true;
    if (metaTitle !== undefined) fleet.metaTitle = metaTitle;
    if (metaDescription !== undefined) fleet.metaDescription = metaDescription;

    // Parse features
    if (features !== undefined) {
      if (Array.isArray(features)) {
        fleet.features = features;
      } else if (typeof features === 'string') {
        fleet.features = features.split(',').map(f => f.trim()).filter(f => f);
      }
    }

    // Handle file uploads with R2
    if (req.files) {
      if (req.files.image && req.files.image[0]) {
        console.log('Updating main image to R2...');
        fleet.image = await uploadFleetImageToR2(req.files.image[0].path, fleet.image, 'fleets');
      }

      if (req.files.images && req.files.images.length > 0) {
        console.log(`Adding ${req.files.images.length} new gallery images to R2...`);
        for (const file of req.files.images) {
          try {
            const url = await uploadFleetImageToR2(file.path, null, 'fleets/gallery');
            fleet.images.push(url);
          } catch (err) {
            console.error('Failed to upload gallery image:', err);
          }
        }
      }
    }

    // Handle removal of gallery images from R2
    if (removeImages) {
      const imagesToRemove = Array.isArray(removeImages) ? removeImages : [removeImages];
      console.log(`Removing ${imagesToRemove.length} gallery images from R2...`);
      for (const imgUrl of imagesToRemove) {
        if (isR2Url(imgUrl)) {
          await deleteImageFromR2(imgUrl);
        }
        fleet.images = fleet.images.filter(img => img !== imgUrl);
      }
    }

    await fleet.save();
    console.log('✅ Fleet updated successfully:', fleet._id);
    res.json({ success: true, message: 'Fleet updated', data: fleet });
  } catch (err) {
    console.error('❌ Error in updateFleet:', err);
    res.status(400).json({ success: false, message: err.message });
  }
};

// DELETE fleet (admin only) - WITH R2
export const deleteFleet = async (req, res) => {
  try {
    console.log('🚗 Deleting fleet:', req.params.id);

    const fleet = await Fleet.findById(req.params.id);
    if (!fleet) {
      return res.status(404).json({ success: false, message: 'Fleet not found' });
    }

    // Delete main image from R2
    if (fleet.image && isR2Url(fleet.image)) {
      await deleteImageFromR2(fleet.image);
    }

    // Delete all gallery images from R2
    if (fleet.images && fleet.images.length > 0) {
      for (const imgUrl of fleet.images) {
        if (isR2Url(imgUrl)) {
          await deleteImageFromR2(imgUrl);
        }
      }
    }

    await Fleet.findByIdAndDelete(req.params.id);
    console.log('✅ Fleet deleted successfully');
    res.json({ success: true, message: 'Fleet deleted successfully' });
  } catch (err) {
    console.error('❌ Error in deleteFleet:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};