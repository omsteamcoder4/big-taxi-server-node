// server/controller/seoController.js
import Seo from '../models/SeoModel.js';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { GoogleGenAI } from '@google/genai';
import axios from 'axios';
import { uploadToR2, deleteFromR2 } from '../utils/r2Client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// @google/generative-ai was fully deprecated/end-of-lifed by Google on Nov 30, 2025.
// Migrated to the current unified SDK: @google/genai
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const GEMINI_MODEL = "gemini-3.5-flash-lite";

// ============ UTILITY FUNCTIONS ============

const setNoCacheHeaders = (res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
};

/**
 * Delete image file from R2
 */
const deleteImageFile = async (imagePath) => {
  if (!imagePath || imagePath === '' || imagePath === 'null' || imagePath === 'undefined') {
    console.log('ℹ️ No image to delete (empty or null)');
    return false;
  }

  try {
    console.log('🔍 Attempting to delete SEO image from R2:', imagePath);

    // If it's an R2 URL, delete from R2
    if (imagePath.includes('r2.cloudflarestorage.com') || 
        imagePath.includes('cloudflare') ||
        imagePath.startsWith('https://')) {
      await deleteFromR2(imagePath);
      console.log(`✅ DELETED SEO image from R2: ${imagePath}`);
      return true;
    }

    // If it's a local path (fallback for backward compatibility)
    // Extract just the filename from the path
    let filename = '';
    if (imagePath.includes('/uploads/')) {
      const parts = imagePath.split('/uploads/');
      filename = parts[parts.length - 1];
      if (filename.includes('/')) {
        filename = filename.split('/').pop();
      }
    } else if (imagePath.includes('\\uploads\\')) {
      const parts = imagePath.split('\\uploads\\');
      filename = parts[parts.length - 1];
      if (filename.includes('\\')) {
        filename = filename.split('\\').pop();
      }
    } else {
      filename = path.basename(imagePath);
    }

    filename = filename.replace(/^[/\\]+|[/\\]+$/g, '');
    const uploadsFolder = path.join(process.cwd(), 'uploads');
    const exactFilePath = path.join(uploadsFolder, filename);

    if (fs.existsSync(exactFilePath)) {
      fs.unlinkSync(exactFilePath);
      console.log(`✅ DELETED local SEO image: ${filename}`);
      return true;
    }

    console.log(`ℹ️ SEO image not found locally: ${filename}`);
    return false;
  } catch (error) {
    console.error('❌ Error deleting SEO image:', error);
    return false;
  }
};

const processAndSaveOgImage = async (fileBuffer, oldImagePath = null) => {
  // Delete old image if it exists
  if (oldImagePath && oldImagePath !== '' && oldImagePath !== 'null' && oldImagePath !== 'undefined') {
    console.log('🗑️ Deleting old OG image before processing new one:', oldImagePath);
    await deleteImageFile(oldImagePath);
  }

  try {
    console.log(`🖼️ Processing OG image...`);
    console.log(`📏 Original buffer size: ${(fileBuffer.length / 1024).toFixed(2)}KB`);

    // Process image with Sharp - single pass, fail-fast
    const quality = 75;
    const buffer = await sharp(fileBuffer)
      .resize(1200, 630, { fit: 'cover', withoutEnlargement: true })
      .webp({ quality, effort: 6 })
      .toBuffer();

    // Generate unique filename
    const filename = `og_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.webp`;
    
    // Upload to R2
    const imageUrl = await uploadToR2(buffer, filename, 'image/webp', 'seo');
    
    const finalSize = (buffer.length / 1024).toFixed(1);
    console.log(`✅ OG image uploaded to R2: ${imageUrl} (${finalSize}KB, quality: ${quality})`);
    
    return imageUrl;
  } catch (error) {
    console.error('❌ Error processing OG image:', error);
    throw error;
  }
};

// ============ POLLINATIONS.AI IMAGE GENERATION ============

const AVAILABLE_MODELS = {
  flux: 'flux',
  turbo: 'turbo',
  gptimage: 'gptimage',
  qwen: 'qwen-image',
  grok: 'grok-imagine',
  zimage: 'zimage',
  ideogram: 'ideogram-v4-turbo'
};

const generateOGImageWithPollination = async (pageType, businessName, model = 'flux') => {
  try {
    const pageLabels = {
      homepage: 'Premium Taxi Service - Safe & Reliable Rides',
      about: 'About Us - Our Story & Mission',
      services: 'Premium Taxi Services - Quality Rides',
      fleet: 'Our Vehicle Fleet - Well Maintained Cars',
      contact: 'Contact Us - Get in Touch',
      booking: 'Book Your Ride - Quick & Easy'
    };

    const pageLabel = pageLabels[pageType] || 'Professional Taxi Service';

    const promptText = `${businessName || 'Big Taxi Tiruppur'} - ${pageLabel}`;
    const encodedPrompt = encodeURIComponent(promptText);
    
    const selectedModel = AVAILABLE_MODELS[model] || AVAILABLE_MODELS.flux;
    
    const width = 1200;
    const height = 630;
    
    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&model=${selectedModel}&nologo=true&enhance=true`;

    console.log(`🎨 Generating OG image with Pollinations.ai (model: ${selectedModel})`);
    console.log(`📝 Prompt: ${promptText.substring(0, 100)}...`);
    console.log(`📐 Dimensions: ${width}x${height}`);

    const imageResponse = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 45000
    });

    const contentType = imageResponse.headers['content-type'] || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      throw new Error(`Invalid content type: ${contentType}`);
    }

    // Process the image
    const processedBuffer = await sharp(imageResponse.data)
      .resize(1200, 630, { fit: 'cover' })
      .webp({ quality: 80 })
      .toBuffer();

    // Generate unique filename
    const filename = `og_ai_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.webp`;

    // Upload to R2
    const savedPath = await uploadToR2(processedBuffer, filename, 'image/webp', 'seo');

    const base64Data = processedBuffer.toString('base64');

    console.log(`✅ AI-generated OG image uploaded to R2: ${savedPath}`);
    console.log(`📏 Size: ${(processedBuffer.length / 1024).toFixed(1)}KB`);

    return {
      data: base64Data,
      mimeType: 'image/webp',
      source: 'pollinations.ai',
      model: selectedModel,
      aspectRatio: 'og',
      width,
      height,
      savedPath
    };
  } catch (error) {
    console.error('❌ Pollinations.ai image generation error:', error);
    throw new Error(`Failed to generate image: ${error.message}`);
  }
};

// ============ AI HELPER FUNCTIONS ============

// Fail-fast: single attempt, no retry loop
const callGeminiWithRetry = async (prompt) => {
  try {
    console.log(`🤖 Sending request to Gemini (${GEMINI_MODEL})...`);
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        maxOutputTokens: 2048,
      }
    });
    console.log(`✅ Gemini request successful`);
    return response;
  } catch (error) {
    console.error('❌ Gemini API error:', error.message);
    throw error;
  }
};

const generateSEOMetaForPage = async (pageType, pageIdentifier, businessName, businessAddress) => {
  try {
    const pageTypeLabels = {
      homepage: 'Homepage',
      about: 'About Us Page',
      services: 'Services Page',
      fleet: 'Fleet/Vehicles Page',
      contact: 'Contact Page',
      booking: 'Booking Page'
    };

    const pageLabel = pageTypeLabels[pageType] || pageType;
    const identifier = pageIdentifier && pageIdentifier !== 'default' ? ` (${pageIdentifier})` : '';

    const prompt = `
      Generate SEO-optimized meta tags for a ${pageLabel} page${identifier} of a taxi/transportation company.

      ${businessName ? `Company Name: ${businessName}` : 'Company Name: Big Taxi Tiruppur'}
      ${businessAddress ? `Business Address: ${businessAddress}` : ''}

      Requirements:
      1. Meta Title: 50-60 characters, include primary keywords, brand name
      2. Meta Description: 150-160 characters, compelling, include keywords
      3. Meta Keywords: 5-8 relevant keywords as a comma-separated string
      4. OG Title: Same as meta title but optimized for social sharing (max 60 chars)
      5. OG Description: Same as meta description but optimized for social sharing (max 160 chars)

      Return ONLY valid JSON in this exact format:
      {
        "metaTitle": "Optimized meta title here",
        "metaDescription": "Optimized meta description here",
        "metaKeywords": "keyword1, keyword2, keyword3, keyword4, keyword5",
        "ogTitle": "Optimized OG title here",
        "ogDescription": "Optimized OG description here"
      }
    `;

    const response = await callGeminiWithRetry(prompt);
    const text = response.text;
    
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('AI response did not contain valid JSON');
  } catch (error) {
    console.error('Error generating SEO meta:', error);
    throw error;
  }
};

const generateLocalSEOData = async (businessName, businessAddress, businessPhone, businessEmail) => {
  try {
    const prompt = `
      Generate Local SEO data for a taxi/transportation business.

      ${businessName ? `Business Name: ${businessName}` : 'Business Name: Big Taxi Tiruppur'}
      ${businessAddress ? `Business Address: ${businessAddress}` : ''}
      ${businessPhone ? `Business Phone: ${businessPhone}` : ''}
      ${businessEmail ? `Business Email: ${businessEmail}` : ''}

      Requirements:
      1. Business Hours: Standard operating hours (e.g., "Mon-Sun: 24/7" or specific hours)
      2. Service Area: List of cities/areas served (comma-separated, at least 5-8 areas in Tamil Nadu/South India)
      3. Business Name (if not provided, generate a realistic name)
      4. Business Phone (if not provided, generate a realistic phone)
      5. Business Email (if not provided, generate a realistic email)
      6. Business Address (if not provided, generate a realistic address)
      7. Business Latitude: Approximate latitude (if not provided)
      8. Business Longitude: Approximate longitude (if not provided)

      Return ONLY valid JSON in this exact format:
      {
        "businessName": "Full business name",
        "businessAddress": "Full business address",
        "businessPhone": "Phone number with country code",
        "businessEmail": "Email address",
        "businessHours": "Operating hours",
        "serviceArea": "City1, City2, City3, City4, City5",
        "businessLatitude": "Latitude coordinate",
        "businessLongitude": "Longitude coordinate"
      }
    `;

    const response = await callGeminiWithRetry(prompt);
    const text = response.text;
    
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('AI response did not contain valid JSON');
  } catch (error) {
    console.error('Error generating local SEO data:', error);
    throw error;
  }
};

const generateScriptsForPage = async (pageType, businessName, businessAddress) => {
  try {
    const pageTypeLabels = {
      homepage: 'Homepage',
      about: 'About Us Page',
      services: 'Services Page',
      fleet: 'Fleet/Vehicles Page',
      contact: 'Contact Page',
      booking: 'Booking Page'
    };

    const pageLabel = pageTypeLabels[pageType] || pageType;

    const prompt = `
      Generate header and footer scripts for a ${pageLabel} page of a taxi/transportation company.

      ${businessName ? `Company Name: ${businessName}` : 'Company Name: Big Taxi Tiruppur'}
      ${businessAddress ? `Business Address: ${businessAddress}` : ''}

      Requirements:
      1. Header Scripts: 
         - Google Analytics 4 tracking code
         - Google Tag Manager container script (if applicable)
         - Meta Pixel base code
         - Schema.org structured data for LocalBusiness
         - Any other tracking/verification scripts

      2. Footer Scripts:
         - Live chat widget (like WhatsApp/Facebook Messenger)
         - Call tracking scripts
         - Remarketing/retargeting pixels
         - Cookie consent banner

      Return ONLY valid JSON in this exact format:
      {
        "headerScripts": "<!-- Google Analytics -->\\n<script>\\n  // GA4 code here\\n</script>\\n<!-- Meta Pixel -->\\n<script>\\n  // Meta Pixel code here\\n</script>\\n<!-- Google Tag Manager -->\\n<script>\\n  // GTM code here\\n</script>\\n<!-- Schema Markup -->\\n<script type=\\"application/ld+json\\">\\n{\\n  \\"@context\\": \\"https://schema.org\\",\\n  \\"@type\\": \\"LocalBusiness\\",\\n  \\"name\\": \\"${businessName || 'Big Taxi Tiruppur'}\\"\\n}\\n</script>",
        "footerScripts": "<!-- WhatsApp Chat Widget -->\\n<script>\\n  // WhatsApp chat code here\\n</script>\\n<!-- Remarketing Pixel -->\\n<script>\\n  // Remarketing code here\\n</script>"
      }
    `;

    const response = await callGeminiWithRetry(prompt);
    const text = response.text;
    
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error('AI response did not contain valid JSON');
  } catch (error) {
    console.error('Error generating scripts:', error);
    throw error;
  }
};

// ============ AI ROUTE HANDLERS ============

export const aiGenerateSEOMeta = async (req, res) => {
  try {
    const { pageType, pageIdentifier, businessName, businessAddress } = req.body;
    
    if (!pageType) {
      return res.status(400).json({
        success: false,
        message: 'Page type is required'
      });
    }
    
    const result = await generateSEOMetaForPage(pageType, pageIdentifier, businessName, businessAddress);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('SEO generation error:', error);
    
    if (error.status === 429) {
      return res.status(429).json({
        success: false,
        message: 'API quota exceeded. Please try again later or upgrade your plan.',
        retryAfter: error.retryAfter || 60
      });
    }
    
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate SEO meta'
    });
  }
};

export const aiGenerateLocalSEO = async (req, res) => {
  try {
    const { businessName, businessAddress, businessPhone, businessEmail } = req.body;
    
    const result = await generateLocalSEOData(businessName, businessAddress, businessPhone, businessEmail);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Local SEO generation error:', error);
    
    if (error.status === 429) {
      return res.status(429).json({
        success: false,
        message: 'API quota exceeded. Please try again later or upgrade your plan.',
        retryAfter: error.retryAfter || 60
      });
    }
    
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate local SEO data'
    });
  }
};

export const aiGenerateScripts = async (req, res) => {
  try {
    const { pageType, businessName, businessAddress } = req.body;
    
    if (!pageType) {
      return res.status(400).json({
        success: false,
        message: 'Page type is required'
      });
    }
    
    const result = await generateScriptsForPage(pageType, businessName, businessAddress);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Scripts generation error:', error);
    
    if (error.status === 429) {
      return res.status(429).json({
        success: false,
        message: 'API quota exceeded. Please try again later.',
        retryAfter: error.retryAfter || 60
      });
    }
    
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate scripts'
    });
  }
};

export const aiGenerateImage = async (req, res) => {
  try {
    const { pageType, businessName, model = 'flux' } = req.body;
    
    if (!pageType) {
      return res.status(400).json({
        success: false,
        message: 'Page type is required'
      });
    }

    console.log('🎨 Generating OG image for page type:', pageType);
    console.log('📝 Business name:', businessName);
    console.log('🤖 Model:', model);

    const image = await generateOGImageWithPollination(pageType, businessName, model);

    res.json({
      success: true,
      data: {
        ogImage: image.savedPath,
        data: image.data,
        mimeType: image.mimeType,
        source: image.source,
        model: image.model,
        message: 'Image generated successfully using Pollinations.ai'
      }
    });
  } catch (error) {
    console.error('Image generation error:', error);

    res.status(500).json({
      success: false,
      message: 'Failed to generate image: ' + error.message
    });
  }
};

export const aiGenerateAll = async (req, res) => {
  try {
    const { pageType, pageIdentifier, businessName, businessAddress, businessPhone, businessEmail } = req.body;
    
    if (!pageType) {
      return res.status(400).json({
        success: false,
        message: 'Page type is required'
      });
    }
    
    console.log('🚀 Generating all SEO data for:', pageType);
    
    // Fail-fast: sequential generation, no fallback retry
    const seoMeta = await generateSEOMetaForPage(pageType, pageIdentifier, businessName, businessAddress);
    const localSEO = await generateLocalSEOData(businessName, businessAddress, businessPhone, businessEmail);
    const scripts = await generateScriptsForPage(pageType, businessName, businessAddress);
    const image = await generateOGImageWithPollination(pageType, businessName);
    
    const mergedData = {
      ...seoMeta,
      ...localSEO,
      ...scripts,
      ogImage: image?.savedPath || '',
      _imageData: image?.data || '',
      _imageMimeType: image?.mimeType || 'image/jpeg'
    };
    
    res.json({
      success: true,
      data: mergedData
    });
  } catch (error) {
    console.error('All SEO generation error:', error);
    
    if (error.status === 429) {
      return res.status(429).json({
        success: false,
        message: 'API quota exceeded. Please try again later.',
        retryAfter: error.retryAfter || 60
      });
    }
    
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate SEO data'
    });
  }
};

// ============ ORIGINAL FUNCTIONS ============

export const getSeoByPage = async (req, res) => {
  try {
    setNoCacheHeaders(res);
    
    const { pageType, identifier = 'default' } = req.params;
    const validPageTypes = ['homepage', 'about', 'services', 'fleet', 'contact', 'booking'];
    
    if (!validPageTypes.includes(pageType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid page type. Must be one of: ' + validPageTypes.join(', ')
      });
    }

    let seo = await Seo.findOne({ pageType, pageIdentifier: identifier }).lean();
    
    if (!seo && identifier !== 'default') {
      seo = await Seo.findOne({ pageType, pageIdentifier: 'default' }).lean();
    }

    // Keep image URL as is (R2 URLs are already full URLs)
    if (seo) {
      if (!seo.ogImage || seo.ogImage === '' || seo.ogImage === 'null' || seo.ogImage === 'undefined') {
        seo.ogImage = null;
      }
      // Only convert local paths, keep R2 URLs as is
      else if (!seo.ogImage.startsWith('http') && !seo.ogImage.startsWith('/uploads/')) {
        seo.ogImage = `/uploads/${seo.ogImage.replace(/^\/+/, '')}`;
      }
    }

    res.status(200).json({
      success: true,
      data: seo || null,
      message: seo ? 'SEO data found' : 'No SEO data found for this page',
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('❌ Get SEO Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Create or Update SEO with R2 image storage
 */
export const createOrUpdateSeo = async (req, res) => {
  try {
    setNoCacheHeaders(res);
    
    console.log('📥 Received SEO data:', req.body);
    console.log('📁 Uploaded file:', req.file ? {
      fieldname: req.file.fieldname,
      originalname: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    } : 'No file uploaded');

    const {
      pageType, pageIdentifier, metaTitle, metaDescription, metaKeywords,
      canonicalUrl, ogTitle, ogDescription, robots, schemaType,
      businessName, businessAddress, businessPhone, businessEmail,
      businessHours, businessLatitude, businessLongitude, serviceArea,
      headerScripts, footerScripts
    } = req.body;

    const validPageTypes = ['homepage', 'about', 'services', 'fleet', 'contact', 'booking'];
    if (!pageType || !validPageTypes.includes(pageType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid page type. Must be one of: ' + validPageTypes.join(', ')
      });
    }

    let parsedKeywords = [];
    if (metaKeywords) {
      if (typeof metaKeywords === 'string') {
        try {
          parsedKeywords = JSON.parse(metaKeywords);
        } catch {
          parsedKeywords = metaKeywords.split(',').map(k => k.trim()).filter(k => k);
        }
      } else if (Array.isArray(metaKeywords)) {
        parsedKeywords = metaKeywords.filter(k => k && k.trim());
      }
    }

    let parsedServiceArea = [];
    if (serviceArea) {
      if (typeof serviceArea === 'string') {
        try {
          parsedServiceArea = JSON.parse(serviceArea);
        } catch {
          parsedServiceArea = serviceArea.split(',').map(area => area.trim()).filter(area => area);
        }
      } else if (Array.isArray(serviceArea)) {
        parsedServiceArea = serviceArea.filter(area => area && area.trim());
      }
    }

    let ogImagePath = null;
    const deletedFlag = req.body.deletedOgImage === 'true';
    const existingImage = req.body.existingOgImage;

    let seo = await Seo.findOne({ pageType, pageIdentifier: pageIdentifier || 'default' });

    // Handle image deletion and upload
    if (deletedFlag) {
      console.log('🗑️ Deleting OG image (deleted flag is true)');
      if (seo && seo.ogImage && seo.ogImage !== '' && seo.ogImage !== 'null' && seo.ogImage !== 'undefined') {
        await deleteImageFile(seo.ogImage);
      }
      ogImagePath = '';
    } else if (req.file) {
      console.log('✅ Processing new OG image upload');
      // Delete old image if exists
      if (seo && seo.ogImage && seo.ogImage !== '' && seo.ogImage !== 'null' && seo.ogImage !== 'undefined') {
        await deleteImageFile(seo.ogImage);
      }
      ogImagePath = await processAndSaveOgImage(req.file.buffer, null);
      console.log('✅ New OG image uploaded to R2:', ogImagePath);
    } else if (existingImage && existingImage.trim() !== '' && existingImage !== 'null' && existingImage !== 'undefined') {
      // Check if it's a valid image (R2 URL or local path)
      if (existingImage.startsWith('https://') || existingImage.startsWith('http://')) {
        // R2 URL - keep it
        ogImagePath = existingImage;
        console.log('📸 Keeping existing R2 OG image:', ogImagePath);
      } else if (existingImage.startsWith('/uploads/')) {
        // Local path - check if file exists
        const filename = existingImage.split('/uploads/')[1];
        const fullPath = path.join(process.cwd(), 'uploads', filename);
        if (!fs.existsSync(fullPath)) {
          console.log(`⚠️ Existing image file not found: ${fullPath}`);
          ogImagePath = '';
        } else {
          ogImagePath = existingImage;
          console.log('📸 Keeping existing local OG image:', ogImagePath);
        }
      } else {
        ogImagePath = existingImage;
        console.log('📸 Keeping existing OG image:', ogImagePath);
      }
    } else if (seo && seo.ogImage) {
      // Check if the stored image still exists (for R2 or local)
      if (seo.ogImage.startsWith('https://') || seo.ogImage.startsWith('http://')) {
        // R2 URL - keep it
        ogImagePath = seo.ogImage;
        console.log('📸 Keeping existing R2 OG image:', ogImagePath);
      } else if (seo.ogImage.startsWith('/uploads/')) {
        const filename = seo.ogImage.split('/uploads/')[1];
        const fullPath = path.join(process.cwd(), 'uploads', filename);
        if (!fs.existsSync(fullPath)) {
          console.log(`⚠️ Stored image file not found: ${fullPath}`);
          ogImagePath = '';
        } else {
          ogImagePath = seo.ogImage;
        }
      } else {
        ogImagePath = seo.ogImage;
      }
    }

    if (seo) {
      if (ogImagePath !== undefined && ogImagePath !== null) {
        seo.ogImage = ogImagePath || '';
      }
      
      seo.metaTitle = metaTitle !== undefined ? (metaTitle || '') : seo.metaTitle;
      seo.metaDescription = metaDescription !== undefined ? (metaDescription || '') : seo.metaDescription;
      seo.metaKeywords = parsedKeywords.length ? parsedKeywords : seo.metaKeywords;
      seo.canonicalUrl = canonicalUrl !== undefined ? (canonicalUrl || '') : seo.canonicalUrl;
      seo.ogTitle = ogTitle !== undefined ? (ogTitle || '') : seo.ogTitle;
      seo.ogDescription = ogDescription !== undefined ? (ogDescription || '') : seo.ogDescription;
      seo.robots = robots !== undefined ? (robots || 'index, follow') : seo.robots;
      seo.schemaType = schemaType !== undefined ? (schemaType || 'LocalBusiness') : seo.schemaType;
      seo.businessName = businessName !== undefined ? (businessName || '') : seo.businessName;
      seo.businessAddress = businessAddress !== undefined ? (businessAddress || '') : seo.businessAddress;
      seo.businessPhone = businessPhone !== undefined ? (businessPhone || '') : seo.businessPhone;
      seo.businessEmail = businessEmail !== undefined ? (businessEmail || '') : seo.businessEmail;
      seo.businessHours = businessHours !== undefined ? (businessHours || '') : seo.businessHours;
      seo.businessLatitude = businessLatitude !== undefined ? (businessLatitude || '') : seo.businessLatitude;
      seo.businessLongitude = businessLongitude !== undefined ? (businessLongitude || '') : seo.businessLongitude;
      seo.serviceArea = parsedServiceArea.length ? parsedServiceArea : seo.serviceArea;
      seo.headerScripts = headerScripts !== undefined ? (headerScripts || '') : seo.headerScripts;
      seo.footerScripts = footerScripts !== undefined ? (footerScripts || '') : seo.footerScripts;
      seo.updatedAt = Date.now();
      
      await seo.save();
      console.log(`✅ SEO updated for ${pageType}${pageIdentifier !== 'default' ? ` (${pageIdentifier})` : ''}`);
      console.log('📸 Final OG image path in DB:', seo.ogImage);
    } else {
      const newOgImage = ogImagePath || '';
      seo = new Seo({
        pageType,
        pageIdentifier: pageIdentifier || 'default',
        metaTitle: metaTitle || '',
        metaDescription: metaDescription || '',
        metaKeywords: parsedKeywords,
        canonicalUrl: canonicalUrl || '',
        ogTitle: ogTitle || '',
        ogDescription: ogDescription || '',
        ogImage: newOgImage,
        robots: robots || 'index, follow',
        schemaType: schemaType || 'LocalBusiness',
        businessName: businessName || '',
        businessAddress: businessAddress || '',
        businessPhone: businessPhone || '',
        businessEmail: businessEmail || '',
        businessHours: businessHours || '',
        businessLatitude: businessLatitude || '',
        businessLongitude: businessLongitude || '',
        serviceArea: parsedServiceArea,
        headerScripts: headerScripts || '',
        footerScripts: footerScripts || ''
      });
      await seo.save();
      console.log(`✅ SEO created for ${pageType}${pageIdentifier !== 'default' ? ` (${pageIdentifier})` : ''}`);
      console.log('📸 Final OG image path in DB:', seo.ogImage);
    }

    res.status(200).json({
      success: true,
      message: seo ? 'SEO updated successfully' : 'SEO created successfully',
      data: seo,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('❌ Create/Update SEO Error:', error);
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'SEO for this page already exists. Use update instead.'
      });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getAllSeo = async (req, res) => {
  try {
    setNoCacheHeaders(res);
    
    const { page = 1, limit = 20, pageType, search } = req.query;
    let filter = {};
    if (pageType && pageType !== 'all') filter.pageType = pageType;
    if (search && search.trim()) {
      filter.$or = [
        { metaTitle: { $regex: search, $options: 'i' } },
        { metaDescription: { $regex: search, $options: 'i' } },
        { pageType: { $regex: search, $options: 'i' } },
        { pageIdentifier: { $regex: search, $options: 'i' } },
        { businessName: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [seoEntries, totalCount] = await Promise.all([
      Seo.find(filter).sort({ pageType: 1, pageIdentifier: 1, createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
      Seo.countDocuments(filter)
    ]);

    res.status(200).json({
      success: true,
      data: seoEntries,
      count: seoEntries.length,
      timestamp: Date.now(),
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalEntries: totalCount,
        hasNext: skip + seoEntries.length < totalCount,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('❌ Get All SEO Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Delete SEO with proper R2 image deletion
 */
export const deleteSeo = async (req, res) => {
  try {
    setNoCacheHeaders(res);
    
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid SEO ID' });
    }
    
    const seo = await Seo.findById(id);
    if (!seo) {
      return res.status(404).json({ success: false, message: 'SEO entry not found' });
    }

    // Delete the OG image if it exists
    if (seo.ogImage && seo.ogImage !== '' && seo.ogImage !== 'null' && seo.ogImage !== 'undefined') {
      console.log(`🗑️ Deleting OG image for SEO entry: ${seo.pageType}/${seo.pageIdentifier}`);
      await deleteImageFile(seo.ogImage);
    } else {
      console.log('ℹ️ No OG image to delete');
    }

    await Seo.findByIdAndDelete(id);
    
    console.log(`✅ SEO entry deleted: ${seo.pageType}/${seo.pageIdentifier}`);
    
    res.status(200).json({ 
      success: true, 
      message: 'SEO deleted successfully', 
      data: seo, 
      timestamp: Date.now() 
    });
  } catch (error) {
    console.error('❌ Delete SEO Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const bulkUpdateSeo = async (req, res) => {
  try {
    setNoCacheHeaders(res);
    
    const { seoEntries } = req.body;
    if (!Array.isArray(seoEntries) || seoEntries.length === 0) {
      return res.status(400).json({ success: false, message: 'Please provide an array of SEO entries' });
    }

    const results = { created: [], updated: [], failed: [] };
    for (const entry of seoEntries) {
      try {
        const { pageType, pageIdentifier = 'default', metaTitle, metaDescription, metaKeywords,
                canonicalUrl, ogTitle, ogDescription, ogImage, robots, schemaType } = entry;
        if (!pageType) throw new Error('Page type is required');

        let parsedKeywords = [];
        if (metaKeywords) {
          if (typeof metaKeywords === 'string') {
            parsedKeywords = metaKeywords.split(',').map(k => k.trim()).filter(k => k);
          } else if (Array.isArray(metaKeywords)) {
            parsedKeywords = metaKeywords.filter(k => k && k.trim());
          }
        }

        let seo = await Seo.findOne({ pageType, pageIdentifier });
        if (seo) {
          seo.metaTitle = metaTitle || seo.metaTitle;
          seo.metaDescription = metaDescription || seo.metaDescription;
          seo.metaKeywords = parsedKeywords.length ? parsedKeywords : seo.metaKeywords;
          seo.canonicalUrl = canonicalUrl || seo.canonicalUrl;
          seo.ogTitle = ogTitle || seo.ogTitle;
          seo.ogDescription = ogDescription || seo.ogDescription;
          seo.ogImage = ogImage || seo.ogImage;
          seo.robots = robots || seo.robots;
          seo.schemaType = schemaType || seo.schemaType;
          await seo.save();
          results.updated.push(seo);
        } else {
          seo = new Seo({
            pageType, pageIdentifier, metaTitle: metaTitle || '', metaDescription: metaDescription || '',
            metaKeywords: parsedKeywords, canonicalUrl: canonicalUrl || '', ogTitle: ogTitle || '',
            ogDescription: ogDescription || '', ogImage: ogImage || '', robots: robots || 'index, follow',
            schemaType: schemaType || 'LocalBusiness'
          });
          await seo.save();
          results.created.push(seo);
        }
      } catch (err) {
        results.failed.push({ entry, reason: err.message });
      }
    }
    res.status(200).json({ success: true, message: 'Bulk SEO update completed', data: results, timestamp: Date.now() });
  } catch (error) {
    console.error('❌ Bulk Update SEO Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getSeoStats = async (req, res) => {
  try {
    setNoCacheHeaders(res);
    
    const totalEntries = await Seo.countDocuments();
    const entriesByType = await Seo.aggregate([{ $group: { _id: '$pageType', count: { $sum: 1 } } }]);
    const entriesWithImages = await Seo.countDocuments({ ogImage: { $exists: true, $ne: '', $nin: ['null', 'undefined'] } });
    const entriesWithCanonical = await Seo.countDocuments({ canonicalUrl: { $exists: true, $ne: '' } });
    res.status(200).json({
      success: true,
      data: { totalEntries, entriesByType, entriesWithImages, entriesWithCanonical, lastUpdated: new Date() },
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('❌ Get SEO Stats Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};