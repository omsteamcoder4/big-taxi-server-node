// controller/serviceController.js - R2 Integration with AI
import Service from '../models/ServiceModel.js';
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

// Plain-text model - SAME AS BLOG CONTROLLER
const model = genAI.getGenerativeModel({ 
  model: process.env.GEMINI_MODEL,
  generationConfig: {
    maxOutputTokens: 4096,
  }
});

// JSON-mode model - SAME AS BLOG CONTROLLER
const modelJson = genAI.getGenerativeModel({
  model: process.env.GEMINI_MODEL,
  generationConfig: {
    maxOutputTokens: 8192,
    responseMimeType: "application/json",
  }
});

// Delete image from R2
const deleteImageFile = async (imageUrl) => {
  if (!imageUrl) return;
  try {
    await deleteFromR2(imageUrl);
  } catch (err) {
    console.error('❌ Error deleting service image from R2:', err);
  }
};

// Optimize image and upload to R2
const processImage = async (tempFilePath, oldImageUrl = null) => {
  if (oldImageUrl) await deleteImageFile(oldImageUrl);

  try {
    const fileBuffer = await fs.promises.readFile(tempFilePath);
    const { buffer, quality, sizeKB } = await optimizeImageToWebP(fileBuffer, 400, 400);
    const filename = `service_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.webp`;
    const publicUrl = await uploadToR2(buffer, filename, 'image/webp');
    
    console.log(`✅ Uploaded service image: ${filename} (${sizeKB}KB, quality: ${quality})`);
    await fs.promises.unlink(tempFilePath).catch(() => {});
    return publicUrl;
  } catch (error) {
    console.error('❌ Error processing image:', error);
    await fs.promises.unlink(tempFilePath).catch(() => {});
    throw error;
  }
};

// Optimize a single image from buffer - single pass, fail-fast
const optimizeImageToWebP = async (inputBuffer, width = 400, height = 400) => {
  const quality = 75;
  const buffer = await sharp(inputBuffer)
    .resize(width, height, { fit: 'contain', withoutEnlargement: true })
    .webp({ quality, effort: 6 })
    .toBuffer();

  return { buffer, quality, sizeKB: (buffer.length / 1024).toFixed(1) };
};

// ============ AI SERVICE GENERATION FUNCTIONS ============

/**
 * Generate service content from a chat description - SAME AI AS BLOGS
 */
const generateServiceFromChat = async (description, location = '') => {
  try {
    const prompt = `
      You are a professional service content creator. Based on the following description, create a complete service offering.

      USER DESCRIPTION: "${description}"
      ${location ? `LOCATION: ${location}` : ''}

      Generate a complete service with:
      1. A compelling, SEO-friendly title (under 60 chars)
      2. A detailed, persuasive description (150-250 words)
      3. 4-6 key features (short, benefit-focused, under 10 words each)
      4. 5-8 bullet points (detailed benefits, under 20 words each)
      5. A suggested category (1-3 words)
      6. SEO meta title (50-60 chars)
      7. SEO meta description (150-160 chars)
      8. 5-8 SEO keywords

      The service should sound professional, trustworthy, and appealing to customers.
      Focus on benefits and value propositions.

      Return ONLY valid JSON in this exact format:
      {
        "title": "Professional Service Title",
        "suggestedCategory": "Category",
        "description": "Detailed service description...",
        "features": ["Feature 1", "Feature 2", "Feature 3", "Feature 4"],
        "bulletPoints": ["Bullet point 1", "Bullet point 2", "Bullet point 3"],
        "metaTitle": "SEO Meta Title",
        "metaDescription": "SEO Meta Description",
        "metaKeywords": ["keyword1", "keyword2", "keyword3"]
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
    console.error('Error generating service from chat:', error);
    throw error;
  }
};

/**
 * Improve existing service content - SAME AI AS BLOGS
 */
const improveServiceContent = async (currentContent, instruction) => {
  try {
    const prompt = `
      You are a professional service content editor. Improve the following service content based on the instruction.

      CURRENT CONTENT:
      Title: ${currentContent.title || ''}
      Description: ${currentContent.description || ''}
      Features: ${(currentContent.features || []).join(', ')}
      Bullet Points: ${(currentContent.bulletPoints || []).join('\n')}

      INSTRUCTION: ${instruction}

      Improve the content to make it more:
      - Professional and persuasive
      - Customer-focused
      - Benefit-driven
      - SEO-friendly

      Return ONLY valid JSON in this exact format:
      {
        "title": "Improved Title",
        "description": "Improved Description",
        "features": ["Feature 1", "Feature 2"],
        "bulletPoints": ["Bullet 1", "Bullet 2"],
        "metaTitle": "Improved Meta Title",
        "metaDescription": "Improved Meta Description",
        "metaKeywords": ["keyword1", "keyword2"]
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
    console.error('Error improving service content:', error);
    throw error;
  }
};

/**
 * Generate an AI image for the service - SAME AS BLOG IMAGE GENERATION
 */
const generateServiceImage = async (title, description, model = 'flux', aspectRatio = 'square') => {
  try {
    const promptText = description ? `${title}: ${description}` : title;
    const encodedPrompt = encodeURIComponent(promptText);
    
    // Use the same image generation as blogs
    const selectedModel = process.env.POLLINATIONS_MODEL_FLUX;
    
    let width, height;
    if (aspectRatio === 'square') {
      width = 400;
      height = 400;
    } else {
      width = 400;
      height = 400;
    }
    
    const imageUrl = `${process.env.POLLINATIONS_BASE_URL}/${encodedPrompt}?width=${width}&height=${height}&model=${selectedModel}`;

    console.log(`🎨 Generating service image with Pollinations.ai (model: ${selectedModel})`);
    console.log(`📝 Prompt: ${promptText.substring(0, 100)}...`);
    console.log(`📐 Dimensions: ${width}x${height}`);

    const imageResponse = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 120000
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
    console.error('Service image generation error:', error);
    throw error;
  }
};

// ============ AI ROUTE HANDLERS ============

/**
 * AI: Generate service from chat description
 * POST /api/services/ai/generate-from-chat
 */
export const aiGenerateServiceFromChat = async (req, res) => {
  try {
    const { description, location } = req.body;

    if (!description || description.trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a description of the service you want to create (minimum 3 characters)'
      });
    }

    const result = await generateServiceFromChat(description, location);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Service generation error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate service content'
    });
  }
};

/**
 * AI: Improve existing service content
 * POST /api/services/ai/improve
 */
export const aiImproveService = async (req, res) => {
  try {
    const { currentContent, instruction } = req.body;

    if (!currentContent) {
      return res.status(400).json({
        success: false,
        message: 'Current service content is required'
      });
    }

    if (!instruction || instruction.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an instruction for how to improve the content'
      });
    }

    const improved = await improveServiceContent(currentContent, instruction);

    res.json({
      success: true,
      data: improved
    });
  } catch (error) {
    console.error('Service improvement error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to improve service content'
    });
  }
};

/**
 * AI: Generate service image - SAME AS BLOG IMAGE GENERATION
 * POST /api/services/ai/generate-image
 */
export const aiGenerateServiceImage = async (req, res) => {
  try {
    const { title, description, model = 'flux' } = req.body;

    if (!title) {
      return res.status(400).json({
        success: false,
        message: 'Service title is required'
      });
    }

    const image = await generateServiceImage(title, description, model, 'square');

    res.json({
      success: true,
      data: image
    });

  } catch (error) {
    console.error('Service image generation error:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to generate image: ' + error.message
    });
  }
};

// ============ ORIGINAL CRUD FUNCTIONS ============

// GET all services
export const getAllServices = async (req, res) => {
  try {
    const { includeInactive, location } = req.query;
    const query = {};

    if (includeInactive !== 'true') query.active = true;
    if (location) {
      query.location = location.toLowerCase().trim();
    }

    const services = await Service.find(query).sort({ displayOrder: 1, createdAt: -1 });
    res.json({ success: true, count: services.length, data: services });
  } catch (err) {
    console.error('Error in getAllServices:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET single service by ID
export const getServiceById = async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }
    res.json({ success: true, data: service });
  } catch (err) {
    console.error('Error in getServiceById:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET service by slug
export const getServiceBySlug = async (req, res) => {
  try {
    const service = await Service.findOne({ slug: req.params.slug });
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }
    res.json({ success: true, data: service });
  } catch (err) {
    console.error('Error in getServiceBySlug:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// CREATE service (admin only)
export const createService = async (req, res) => {
  try {
    console.log('🔧 Creating service...');
    console.log('Request body:', req.body);
    console.log('Request files:', req.files ? Object.keys(req.files) : 'No files');

    const {
      title,
      description,
      features,
      bulletPoints,
      displayOrder,
      active,
      isFeatured,
      location,
      metaTitle,
      metaDescription,
      metaKeywords
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Service title is required' });
    }
    if (!description || !description.trim()) {
      return res.status(400).json({ success: false, message: 'Description is required' });
    }

    let imagePath = '';

    if (req.files && req.files.image && req.files.image[0]) {
      console.log('Processing service image...');
      imagePath = await processImage(req.files.image[0].path);
    }

    const slug = title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const existingService = await Service.findOne({ slug });
    let finalSlug = slug;
    if (existingService) {
      finalSlug = `${slug}-${Math.floor(Math.random() * 1000)}`;
      console.log(`⚠️ Slug "${slug}" already exists, using "${finalSlug}" instead`);
    }

    let featuresArray = [];
    if (features) {
      if (Array.isArray(features)) {
        featuresArray = features;
      } else if (typeof features === 'string') {
        featuresArray = features.split(',').map(f => f.trim()).filter(f => f);
      }
    }

    let bulletPointsArray = [];
    if (bulletPoints) {
      if (Array.isArray(bulletPoints)) {
        bulletPointsArray = bulletPoints;
      } else if (typeof bulletPoints === 'string') {
        bulletPointsArray = bulletPoints.split('\n').map(b => b.trim()).filter(b => b);
      }
    }

    let keywordsArray = [];
    if (metaKeywords) {
      if (Array.isArray(metaKeywords)) {
        keywordsArray = metaKeywords;
      } else if (typeof metaKeywords === 'string') {
        keywordsArray = metaKeywords.split(',').map(k => k.trim()).filter(k => k);
      }
    }

    const serviceData = {
      title: title.trim(),
      slug: finalSlug,
      description: description.trim(),
      features: featuresArray,
      bulletPoints: bulletPointsArray,
      image: imagePath,
      displayOrder: parseInt(displayOrder) || 0,
      active: active === 'false' ? false : true,
      isFeatured: isFeatured === 'true' || isFeatured === true,
      location: location || '',
      metaTitle: metaTitle || '',
      metaDescription: metaDescription || '',
      metaKeywords: keywordsArray,
    };

    console.log('Creating service with data:', serviceData);

    const service = await Service.create(serviceData);

    console.log('✅ Service created successfully:', service._id);
    res.status(201).json({ success: true, message: 'Service created', data: service });
  } catch (err) {
    console.error('❌ Error in createService:', err);
    res.status(400).json({ success: false, message: err.message });
  }
};

// UPDATE service (admin only)
export const updateService = async (req, res) => {
  try {
    console.log('🔧 Updating service:', req.params.id);

    const service = await Service.findById(req.params.id);
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }

    const {
      title,
      description,
      features,
      bulletPoints,
      displayOrder,
      active,
      isFeatured,
      location,
      metaTitle,
      metaDescription,
      metaKeywords
    } = req.body;

    if (title !== undefined && title.trim()) {
      service.title = title.trim();
      const newSlug = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      const existingService = await Service.findOne({ slug: newSlug, _id: { $ne: service._id } });
      if (existingService) {
        service.slug = `${newSlug}-${Math.floor(Math.random() * 1000)}`;
        console.log(`⚠️ Slug "${newSlug}" already exists, using "${service.slug}" instead`);
      } else {
        service.slug = newSlug;
      }
    }
    if (description !== undefined) service.description = description.trim();
    if (displayOrder !== undefined) service.displayOrder = parseInt(displayOrder) || 0;
    if (active !== undefined) service.active = active === 'true' || active === true;
    if (isFeatured !== undefined) service.isFeatured = isFeatured === 'true' || isFeatured === true;
    if (location !== undefined) service.location = location.toLowerCase().trim();
    if (metaTitle !== undefined) service.metaTitle = metaTitle;
    if (metaDescription !== undefined) service.metaDescription = metaDescription;

    if (features !== undefined) {
      if (Array.isArray(features)) {
        service.features = features;
      } else if (typeof features === 'string') {
        service.features = features.split(',').map(f => f.trim()).filter(f => f);
      } else {
        service.features = [];
      }
    }

    if (bulletPoints !== undefined) {
      if (Array.isArray(bulletPoints)) {
        service.bulletPoints = bulletPoints;
      } else if (typeof bulletPoints === 'string') {
        service.bulletPoints = bulletPoints.split('\n').map(b => b.trim()).filter(b => b);
      } else {
        service.bulletPoints = [];
      }
    }

    if (metaKeywords !== undefined) {
      if (Array.isArray(metaKeywords)) {
        service.metaKeywords = metaKeywords;
      } else if (typeof metaKeywords === 'string') {
        service.metaKeywords = metaKeywords.split(',').map(k => k.trim()).filter(k => k);
      } else {
        service.metaKeywords = [];
      }
    }

    if (req.files && req.files.image && req.files.image[0]) {
      console.log('Updating service image...');
      service.image = await processImage(req.files.image[0].path, service.image);
    }

    await service.save();
    console.log('✅ Service updated successfully:', service._id);
    res.json({ success: true, message: 'Service updated', data: service });
  } catch (err) {
    console.error('❌ Error in updateService:', err);
    res.status(400).json({ success: false, message: err.message });
  }
};

// DELETE service (admin only)
export const deleteService = async (req, res) => {
  try {
    console.log('🔧 Deleting service:', req.params.id);

    const service = await Service.findById(req.params.id);
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }

    if (service.image && service.image.trim() !== '') {
      await deleteImageFile(service.image);
    }

    await Service.findByIdAndDelete(req.params.id);
    console.log('✅ Service deleted successfully');
    res.json({ success: true, message: 'Service deleted successfully' });
  } catch (err) {
    console.error('❌ Error in deleteService:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};