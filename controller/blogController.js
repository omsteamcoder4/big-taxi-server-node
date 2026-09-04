// controller/blogController.js - R2 Integration
import Blog from '../models/Blog.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';
import { uploadToR2, deleteFromR2 } from '../utils/r2Client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Plain-text model
const model = genAI.getGenerativeModel({ 
  model: "gemini-3.6-flash",
  generationConfig: {
    maxOutputTokens: 4096,
  }
});

// JSON-mode model
const modelJson = genAI.getGenerativeModel({
  model: "gemini-3.6-flash",
  generationConfig: {
    maxOutputTokens: 8192,
    responseMimeType: "application/json",
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
 * Extract filename from URL or path
 */
const extractFilename = (imagePath) => {
  if (!imagePath) return null;
  
  // Handle R2 URLs
  if (isR2Url(imagePath)) {
    const parts = imagePath.split('/');
    return parts[parts.length - 1];
  }
  
  // Handle local paths
  if (imagePath.includes('/uploads/')) {
    const parts = imagePath.split('/uploads/');
    let filename = parts[parts.length - 1];
    if (filename.includes('/')) {
      filename = filename.split('/').pop();
    }
    return filename;
  }
  
  if (imagePath.includes('\\uploads\\')) {
    const parts = imagePath.split('\\uploads\\');
    let filename = parts[parts.length - 1];
    if (filename.includes('\\')) {
      filename = filename.split('\\').pop();
    }
    return filename;
  }
  
  return path.basename(imagePath);
};

/**
 * Delete image from R2
 */
const deleteImageFromR2 = async (imageUrl) => {
  if (!imageUrl || imageUrl === '' || imageUrl === 'null' || imageUrl === 'undefined') {
    console.log('ℹ️ No image URL provided for deletion');
    return false;
  }
  
  try {
    console.log('🗑️ Attempting to delete blog image from R2:', imageUrl);
    
    // Check if it's an R2 URL
    if (isR2Url(imageUrl)) {
      const result = await deleteFromR2(imageUrl);
      if (result) {
        console.log('✅ DELETED from R2:', imageUrl);
        return true;
      }
      console.warn('⚠️ R2 deletion returned false for:', imageUrl);
      return false;
    } else {
      // If it's a local path, try to delete locally (fallback)
      console.log('📁 Deleting local blog image:', imageUrl);
      return deleteLocalImage(imageUrl);
    }
  } catch (error) {
    console.error('❌ Error deleting blog image:', error);
    return false;
  }
};

/**
 * Delete local image file (fallback)
 */
const deleteLocalImage = (imagePath) => {
  if (!imagePath || imagePath === '' || imagePath === 'null' || imagePath === 'undefined') {
    return false;
  }

  try {
    const uploadsFolder = path.join(process.cwd(), 'uploads');
    const filename = extractFilename(imagePath);
    
    if (!filename) {
      console.log('⚠️ Could not extract filename from:', imagePath);
      return false;
    }

    const exactFilePath = path.join(uploadsFolder, filename);
    console.log(`📁 Looking for file at: ${exactFilePath}`);

    if (fs.existsSync(exactFilePath)) {
      fs.unlinkSync(exactFilePath);
      console.log(`✅ DELETED local blog image: ${filename}`);
      return true;
    } else {
      console.log(`❌ Local blog image not found: ${filename}`);
      return false;
    }
  } catch (error) {
    console.error('❌ Error deleting local blog image:', error);
    return false;
  }
};

/**
 * Optimize image to WebP under 40KB and upload to R2
 */
const processAndUploadToR2 = async (fileBuffer, oldImagePath = null, folder = 'blogs') => {
  try {
    // Delete old image if it exists
    if (oldImagePath && oldImagePath !== '' && oldImagePath !== 'null' && oldImagePath !== 'undefined') {
      console.log('🗑️ Deleting old blog image before processing new one:', oldImagePath);
      await deleteImageFromR2(oldImagePath);
    }

    console.log(`🖼️ Processing blog image for R2 upload`);
    console.log(`📏 Original buffer size: ${(fileBuffer.length / 1024).toFixed(2)}KB`);

    // Optimize to WebP - blog featured image (1200x675)
    let quality = 80;
    let buffer = await sharp(fileBuffer)
      .resize(1200, 675, { fit: 'cover', withoutEnlargement: true })
      .webp({ quality, effort: 6 })
      .toBuffer();

    let attempts = 0;
    while (buffer.length / 1024 > 40 && quality > 20 && attempts < 5) {
      quality -= 10;
      buffer = await sharp(fileBuffer)
        .resize(1200, 675, { fit: 'cover', withoutEnlargement: true })
        .webp({ quality, effort: 6 })
        .toBuffer();
      attempts++;
      console.log(`🔄 Attempt ${attempts}: Quality ${quality}%, Size: ${(buffer.length / 1024).toFixed(2)}KB`);
    }

    const finalSize = (buffer.length / 1024).toFixed(1);
    console.log(`✅ Image optimized: ${finalSize}KB, quality: ${quality}`);

    // Generate unique filename
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const filename = `blog_${timestamp}_${randomStr}.webp`;

    // Upload to R2
    const publicUrl = await uploadToR2(buffer, filename, 'image/webp', folder);
    
    console.log(`🔗 Blog image URL: ${publicUrl}`);
    return publicUrl;
  } catch (error) {
    console.error('❌ Error processing and uploading to R2:', error);
    throw error;
  }
};

/**
 * Process OG image separately (1200x630 for social sharing)
 */
const processOGImageToR2 = async (fileBuffer, oldImagePath = null, folder = 'blogs/og') => {
  try {
    // Delete old OG image if it exists
    if (oldImagePath && oldImagePath !== '' && oldImagePath !== 'null' && oldImagePath !== 'undefined') {
      console.log('🗑️ Deleting old OG image before processing new one:', oldImagePath);
      await deleteImageFromR2(oldImagePath);
    }

    console.log(`🖼️ Processing OG image for R2 upload`);
    console.log(`📏 Original buffer size: ${(fileBuffer.length / 1024).toFixed(2)}KB`);

    // Optimize to WebP - OG image (1200x630)
    let quality = 80;
    let buffer = await sharp(fileBuffer)
      .resize(1200, 630, { fit: 'cover', withoutEnlargement: true })
      .webp({ quality, effort: 6 })
      .toBuffer();

    let attempts = 0;
    while (buffer.length / 1024 > 40 && quality > 20 && attempts < 5) {
      quality -= 10;
      buffer = await sharp(fileBuffer)
        .resize(1200, 630, { fit: 'cover', withoutEnlargement: true })
        .webp({ quality, effort: 6 })
        .toBuffer();
      attempts++;
      console.log(`🔄 Attempt ${attempts}: Quality ${quality}%, Size: ${(buffer.length / 1024).toFixed(2)}KB`);
    }

    const finalSize = (buffer.length / 1024).toFixed(1);
    console.log(`✅ OG image optimized: ${finalSize}KB, quality: ${quality}`);

    // Generate unique filename
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const filename = `og_${timestamp}_${randomStr}.webp`;

    // Upload to R2
    const publicUrl = await uploadToR2(buffer, filename, 'image/webp', folder);
    
    console.log(`🔗 OG image URL: ${publicUrl}`);
    return publicUrl;
  } catch (error) {
    console.error('❌ Error processing OG image to R2:', error);
    throw error;
  }
};

// ============ AI HELPER FUNCTIONS ============

const generateSEOMeta = async (title, description, content) => {
  try {
    const prompt = `
      Generate SEO-optimized meta title and description for a blog post.
      
      Blog Title: "${title}"
      Blog Description: "${description}"
      Blog Content: "${content.substring(0, 2000)}..."
      
      Requirements:
      1. Meta Title: 50-60 characters, include primary keyword
      2. Meta Description: 150-160 characters, compelling and includes keywords
      
      Return ONLY valid JSON in this exact format:
      {
        "metaTitle": "Your optimized title here",
        "metaDescription": "Your optimized description here"
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
    console.error('Error generating SEO meta:', error);
    throw error;
  }
};

const generateTags = async (title, description, content) => {
  try {
    const prompt = `
      Generate 5-8 relevant tags/keywords for this blog post.
      Tags should be specific, relevant, and help with discoverability.
      
      Title: "${title}"
      Description: "${description}"
      Content: "${content.substring(0, 2000)}..."
      
      Return ONLY a JSON array of strings:
      ["tag1", "tag2", "tag3", "tag4", "tag5"]
    `;

    const result = await modelJson.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    try {
      const tags = JSON.parse(text);
      return Array.isArray(tags) ? tags.filter(tag => tag && typeof tag === 'string') : [];
    } catch {
      const arrayMatch = text.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        const tags = JSON.parse(arrayMatch[0]);
        return tags.filter(tag => tag && typeof tag === 'string');
      }
      throw new Error('AI response did not contain a valid tag list');
    }
  } catch (error) {
    console.error('Error generating tags:', error);
    throw error;
  }
};

const generateExcerpt = async (content, maxLength = 250) => {
  try {
    const prompt = `
      Create a compelling excerpt (${maxLength} characters max) from this blog content.
      Make it engaging and summarize the key points.
      
      Content: "${content.substring(0, 3000)}..."
      
      Return ONLY the excerpt text, no additional formatting.
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    let excerpt = response.text().trim();
    
    if (excerpt.length > maxLength) {
      excerpt = excerpt.substring(0, maxLength - 3) + '...';
    }
    
    return excerpt;
  } catch (error) {
    console.error('Error generating excerpt:', error);
    throw error;
  }
};

const improveContent = async (content) => {
  try {
    const prompt = `
      Improve this blog content for better readability, grammar, and flow.
      Fix any spelling or grammatical errors.
      Make it more engaging and professional.
      Keep the same meaning and information.
      
      Content: "${content}"
      
      Return ONLY the improved content, no additional text.
    `;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text().trim();
  } catch (error) {
    console.error('Error improving content:', error);
    throw error;
  }
};

const generateOutline = async (topic, category) => {
  try {
    const prompt = `
      Create a rich, magazine-style blog post on the topic: "${topic}"
      Category: "${category || 'General'}"

      Write like a professional content editor building a visually engaging article —
      not a wall of plain paragraphs. Vary the content types across sections: some
      sections should be short narrative paragraphs, some should be bullet lists,
      and AT LEAST ONE section (where it naturally fits, e.g. comparisons, pricing,
      specs, pros/cons, options) MUST be a comparison TABLE. Suggest at least 2
      in-content images at points where a visual would help the reader (not just the
      featured image).

      Include:
      1. A compelling title
      2. A suggested category if none was given (short, 1-3 words)
      3. A short description/summary (150-200 characters, used as the blog's short description)
      4. Introduction hook (2-3 sentences)
      5. 4-5 main sections, kept concise. Each section has:
         - "heading": the section title
         - "type": one of "paragraph", "bullets", or "table"
         - "summary": ONE short one-line sub-description for the section (used under the heading, like a mini-intro)
         - "body": for type "paragraph", a short 2-3 sentence paragraph
         - "bullets": for type "bullets", an array of 3-5 short, specific bullet points (each under 15 words)
         - "table": for type "table", an object { "headers": ["Col1","Col2","Col3"], "rows": [["a","b","c"], ["d","e","f"]] } comparing relevant items (e.g. types/tiers/options) with 3-4 rows and 2-3 columns
         - "image": OPTIONAL, only on 1-2 of the sections — an object { "suggestion": "short visual description of what image to show", "alt": "concise accessibility alt text under 125 characters", "caption": "short one-line caption" }
      6. Conclusion (2 sentences)
      7. Descriptive alt text for the featured image (concise, accessibility-focused, under 125 characters)
      8. 5-8 SEO meta keywords relevant to the topic

      Keep every text field concise — this must fit in a single compact JSON response.
      Return ONLY valid JSON in this exact format, no markdown fences, no extra commentary:
      {
        "title": "Suggested title",
        "suggestedCategory": "Suggested category",
        "shortDescription": "Short description here",
        "introduction": "Introduction paragraph",
        "sections": [
          {
            "heading": "Section heading",
            "type": "paragraph",
            "summary": "One-line sub-description",
            "body": "Short paragraph text",
            "image": { "suggestion": "...", "alt": "...", "caption": "..." }
          },
          {
            "heading": "Section heading",
            "type": "bullets",
            "summary": "One-line sub-description",
            "bullets": ["Point 1", "Point 2", "Point 3"]
          },
          {
            "heading": "Section heading",
            "type": "table",
            "summary": "One-line sub-description",
            "table": { "headers": ["Col1", "Col2", "Col3"], "rows": [["a","b","c"]] }
          }
        ],
        "conclusion": "Conclusion paragraph",
        "imageAltText": "Descriptive alt text for the featured image",
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
    console.error('Error generating outline:', error);
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

const generateBlogImage = async (title, description, model = 'flux', aspectRatio = 'featured') => {
  try {
    const promptText = description ? `${title}: ${description}` : title;
    const encodedPrompt = encodeURIComponent(promptText);
    
    const selectedModel = AVAILABLE_MODELS[model] || AVAILABLE_MODELS.flux;
    
    let width, height;
    if (aspectRatio === 'og') {
      width = 1200;
      height = 630;
    } else {
      width = 1200;
      height = 675;
    }
    
    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&model=${selectedModel}&nologo=true&enhance=true`;

    console.log(`🎨 Generating ${aspectRatio} image with Pollinations.ai (model: ${selectedModel})`);
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
    console.error('Pollinations image generation error:', error);
    throw error;
  }
};

// ============ AI ROUTE HANDLERS ============

export const aiGenerateSEOMeta = async (req, res) => {
  try {
    const { title, description, content } = req.body;
    
    if (!title || !description || !content) {
      return res.status(400).json({
        success: false,
        message: 'Title, description, and content are required'
      });
    }
    
    const result = await generateSEOMeta(title, description, content);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('SEO generation error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate SEO meta'
    });
  }
};

export const aiGenerateTags = async (req, res) => {
  try {
    const { title, description, content } = req.body;
    
    if (!content) {
      return res.status(400).json({
        success: false,
        message: 'Content is required'
      });
    }
    
    const tags = await generateTags(title, description, content);
    
    res.json({
      success: true,
      data: { tags }
    });
  } catch (error) {
    console.error('Tag generation error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate tags'
    });
  }
};

export const aiGenerateExcerpt = async (req, res) => {
  try {
    const { content, maxLength } = req.body;
    
    if (!content) {
      return res.status(400).json({
        success: false,
        message: 'Content is required'
      });
    }
    
    const excerpt = await generateExcerpt(content, maxLength);
    
    res.json({
      success: true,
      data: { excerpt }
    });
  } catch (error) {
    console.error('Excerpt generation error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate excerpt'
    });
  }
};

export const aiImproveContent = async (req, res) => {
  try {
    const { content } = req.body;
    
    if (!content) {
      return res.status(400).json({
        success: false,
        message: 'Content is required'
      });
    }
    
    const improved = await improveContent(content);
    
    res.json({
      success: true,
      data: { content: improved }
    });
  } catch (error) {
    console.error('Content improvement error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to improve content'
    });
  }
};

export const aiGenerateOutline = async (req, res) => {
  try {
    const { topic, category } = req.body;
    
    if (!topic) {
      return res.status(400).json({
        success: false,
        message: 'Topic is required'
      });
    }
    
    const outline = await generateOutline(topic, category);

    const imageSections = (outline.sections || [])
      .map((section, index) => ({ section, index }))
      .filter(({ section }) => section?.image?.suggestion)
      .slice(0, 2);

    if (imageSections.length > 0) {
      const results = await Promise.allSettled(
        imageSections.map(({ section }) =>
          generateBlogImage(section.image.suggestion, '', 'flux', 'featured')
        )
      );

      results.forEach((result, i) => {
        const { index } = imageSections[i];
        if (result.status === 'fulfilled') {
          outline.sections[index].image.dataUrl =
            `data:${result.value.mimeType};base64,${result.value.data}`;
        } else {
          console.error('In-content image generation failed for section', index, result.reason);
          delete outline.sections[index].image;
        }
      });
    }
    
    res.json({
      success: true,
      data: outline
    });
  } catch (error) {
    console.error('Outline generation error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to generate outline'
    });
  }
};

export const aiGenerateImage = async (req, res) => {
  try {
    const { title, description, model = 'flux' } = req.body;

    if (!title) {
      return res.status(400).json({
        success: false,
        message: 'Title is required'
      });
    }

    const image = await generateBlogImage(title, description, model, 'featured');

    res.json({
      success: true,
      data: image
    });

  } catch (error) {
    console.error('Image generation error:', error);
    
    try {
      const { title } = req.body;
      console.log('🔄 Attempting fallback generation with turbo model...');
      
      const fallbackImage = await generateBlogImage(title, '', 'turbo', 'featured');
      
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

export const aiGenerateOGImage = async (req, res) => {
  try {
    const { title, description, model = 'flux' } = req.body;

    if (!title) {
      return res.status(400).json({
        success: false,
        message: 'Title is required'
      });
    }

    const image = await generateBlogImage(title, description, model, 'og');

    res.json({
      success: true,
      data: image
    });

  } catch (error) {
    console.error('OG Image generation error:', error);
    
    try {
      const { title } = req.body;
      console.log('🔄 Attempting OG fallback generation with turbo model...');
      
      const fallbackImage = await generateBlogImage(title, '', 'turbo', 'og');
      
      return res.json({
        success: true,
        data: {
          ...fallbackImage,
          note: 'Generated with fallback model (turbo)'
        }
      });
    } catch (fallbackError) {
      console.error('OG fallback generation also failed:', fallbackError);
      
      res.status(500).json({
        success: false,
        message: 'Failed to generate OG image: ' + error.message
      });
    }
  }
};

export const aiGenerateAllImages = async (req, res) => {
  try {
    const { title, description, model = 'flux' } = req.body;

    if (!title) {
      return res.status(400).json({
        success: false,
        message: 'Title is required'
      });
    }

    const [featuredImage, ogImage] = await Promise.all([
      generateBlogImage(title, description, model, 'featured'),
      generateBlogImage(title, description, model, 'og')
    ]);

    res.json({
      success: true,
      data: {
        featured: featuredImage,
        og: ogImage
      }
    });

  } catch (error) {
    console.error('All images generation error:', error);
    
    try {
      const { title, description } = req.body;
      const featuredImage = await generateBlogImage(title, description, 'flux', 'featured');
      
      return res.json({
        success: true,
        data: {
          featured: featuredImage,
          og: null,
          note: 'OG image generation failed, but featured image was created'
        }
      });
    } catch (fallbackError) {
      res.status(500).json({
        success: false,
        message: 'Failed to generate images: ' + error.message
      });
    }
  }
};

// ============ ORIGINAL FUNCTIONS ============

/**
 * @desc    Create a new blog post
 * @route   POST /api/blogs
 * @access  Private/Admin
 */
export const createBlog = async (req, res) => {
  try {
    const {
      title,  
      description,
      content,
      imageAlt,
      excerpt,
      category,
      tags,
      status,
      metaTitle,
      metaDescription,
      metaKeywords,
      canonicalUrl,
      ogTitle,
      ogDescription,
      scheduledPublishDate
    } = req.body;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please upload at least a blog image'
      });
    }

    const blogImage = req.files.find(file => file.fieldname === 'image');
    const ogImageFile = req.files.find(file => file.fieldname === 'ogImage');

    if (!blogImage) {
      return res.status(400).json({
        success: false,
        message: 'Blog image is required (field name: "image")'
      });
    }

    let parsedMetaKeywords = [];
    if (metaKeywords) {
      if (typeof metaKeywords === 'string') {
        parsedMetaKeywords = metaKeywords.split(',').map(kw => kw.trim()).filter(kw => kw);
      } else if (Array.isArray(metaKeywords)) {
        parsedMetaKeywords = metaKeywords;
      }
    }

    let parsedTags = [];
    if (tags) {
      if (typeof tags === 'string') {
        parsedTags = tags.split(',').map(tag => tag.trim()).filter(tag => tag);
      } else if (Array.isArray(tags)) {
        parsedTags = tags;
      }
    }

    // Process and upload images to R2
    const blogImageBuffer = await fs.promises.readFile(blogImage.path);
    const imageUrl = await processAndUploadToR2(blogImageBuffer, null, 'blogs');

    let ogImageUrl = imageUrl; // Default to same as main image
    if (ogImageFile) {
      const ogBuffer = await fs.promises.readFile(ogImageFile.path);
      ogImageUrl = await processOGImageToR2(ogBuffer, null, 'blogs/og');
    }

    // Clean up temp files
    for (const file of req.files) {
      await fs.promises.unlink(file.path).catch(() => {});
    }

    // Parse scheduledPublishDate if provided
    let parsedScheduledDate = null;
    if (scheduledPublishDate) {
      const date = new Date(scheduledPublishDate);
      if (!isNaN(date.getTime())) {
        // Store as UTC to preserve the exact time
        parsedScheduledDate = new Date(date.toISOString());
      }
    }

    // Determine actual status
    let finalStatus = status || 'draft';
    let publishedAt = null;
    
    // If status is 'published' but has a future date, set to 'scheduled'
    if (finalStatus === 'published' && parsedScheduledDate && parsedScheduledDate > new Date()) {
      finalStatus = 'scheduled';
    }
    
    // If status is 'scheduled' and date is in past, auto-publish
    if (finalStatus === 'scheduled' && parsedScheduledDate && parsedScheduledDate <= new Date()) {
      finalStatus = 'published';
      publishedAt = new Date();
    }

    const blog = await Blog.create({
      title,
      description,
      content,
      image: imageUrl,
      imageAlt: imageAlt || title,
      excerpt: excerpt || description.substring(0, 250) + '...',
      author: req.user._id,
      authorName: req.user.name || req.user.username,
      category,
      tags: parsedTags,
      status: finalStatus,
      metaTitle: metaTitle || '',
      metaDescription: metaDescription || '',
      metaKeywords: parsedMetaKeywords,
      canonicalUrl: canonicalUrl || '',
      ogTitle: ogTitle || '',
      ogDescription: ogDescription || '',
      ogImage: ogImageUrl,
      scheduledPublishDate: parsedScheduledDate,
      publishedAt: publishedAt
    });

    res.status(201).json({
      success: true,
      message: 'Blog post created successfully',
      data: blog
    });
  } catch (error) {
    console.error('Create blog error:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'A blog with similar title already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create blog post',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Update a blog post
 * @route   PUT /api/blogs/:id
 * @access  Private/Admin
 */
export const updateBlog = async (req, res) => {
  try {
    const { id } = req.params;
    
    const {
      title,
      description,
      content,
      imageAlt,
      excerpt,
      category,
      tags,
      status,
      metaTitle,
      metaDescription,
      metaKeywords,
      canonicalUrl,
      ogTitle,
      ogDescription,
      deletedImage,
      deletedOgImage,
      scheduledPublishDate
    } = req.body;

    const blog = await Blog.findById(id);
    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog post not found'
      });
    }

    if (blog.author.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this blog'
      });
    }

    let imageUpdate = {};
    
    // Handle explicit deletion requests from frontend
    if (deletedImage === 'true' || deletedImage === true) {
      if (blog.image) {
        console.log('🗑️ Deleting featured image (explicit delete request):', blog.image);
        await deleteImageFromR2(blog.image);
        imageUpdate.image = '';
      }
    }
    
    if (deletedOgImage === 'true' || deletedOgImage === true) {
      if (blog.ogImage) {
        console.log('🗑️ Deleting OG image (explicit delete request):', blog.ogImage);
        await deleteImageFromR2(blog.ogImage);
        imageUpdate.ogImage = '';
      }
    }
    
    // Handle file uploads
    if (req.files && req.files.length > 0) {
      const blogImage = req.files.find(file => file.fieldname === 'image');
      const ogImageFile = req.files.find(file => file.fieldname === 'ogImage');
      
      // Process blog image
      if (blogImage) {
        const buffer = await fs.promises.readFile(blogImage.path);
        imageUpdate.image = await processAndUploadToR2(buffer, blog.image, 'blogs');
        await fs.promises.unlink(blogImage.path).catch(() => {});
      }
      
      // Process OG image
      if (ogImageFile) {
        const buffer = await fs.promises.readFile(ogImageFile.path);
        imageUpdate.ogImage = await processOGImageToR2(buffer, blog.ogImage, 'blogs/og');
        await fs.promises.unlink(ogImageFile.path).catch(() => {});
      } else if (blogImage && !ogImageFile) {
        // If only blog image is updated and no separate OG image upload
        if (!deletedOgImage && !blog.ogImage) {
          imageUpdate.ogImage = imageUpdate.image || blog.image;
        }
      }
    }

    // Parse metaKeywords
    let parsedMetaKeywords = blog.metaKeywords;
    if (metaKeywords !== undefined) {
      if (typeof metaKeywords === 'string') {
        parsedMetaKeywords = metaKeywords.split(',').map(kw => kw.trim()).filter(kw => kw);
      } else if (Array.isArray(metaKeywords)) {
        parsedMetaKeywords = metaKeywords;
      }
    }

    // Parse tags
    let parsedTags = blog.tags;
    if (tags !== undefined) {
      if (typeof tags === 'string') {
        parsedTags = tags.split(',').map(tag => tag.trim()).filter(tag => tag);
      } else if (Array.isArray(tags)) {
        parsedTags = tags;
      }
    }

    // Parse scheduledPublishDate
    let parsedScheduledDate = blog.scheduledPublishDate;
    if (scheduledPublishDate !== undefined) {
      if (scheduledPublishDate) {
        const date = new Date(scheduledPublishDate);
        if (!isNaN(date.getTime())) {
          // Store as UTC to preserve the exact time
          parsedScheduledDate = new Date(date.toISOString());
        }
      } else {
        parsedScheduledDate = null;
      }
    }

    // Determine actual status
    let finalStatus = status || blog.status;
    let publishedAt = blog.publishedAt;
    
    // If status is 'published' but has a future date, set to 'scheduled'
    if (finalStatus === 'published' && parsedScheduledDate && parsedScheduledDate > new Date()) {
      finalStatus = 'scheduled';
    }
    
    // If status is 'scheduled' and date is in past, auto-publish
    if (finalStatus === 'scheduled' && parsedScheduledDate && parsedScheduledDate <= new Date()) {
      finalStatus = 'published';
      publishedAt = new Date();
    }

    // Update blog fields
    blog.title = title || blog.title;
    blog.description = description || blog.description;
    blog.content = content || blog.content;
    blog.imageAlt = imageAlt || blog.imageAlt;
    blog.excerpt = excerpt || blog.excerpt;
    blog.category = category || blog.category;
    blog.tags = parsedTags;
    blog.status = finalStatus;
    blog.metaTitle = metaTitle || blog.metaTitle;
    blog.metaDescription = metaDescription || blog.metaDescription;
    blog.metaKeywords = parsedMetaKeywords;
    blog.canonicalUrl = canonicalUrl || blog.canonicalUrl;
    blog.ogTitle = ogTitle || blog.ogTitle;
    blog.ogDescription = ogDescription || blog.ogDescription;
    blog.scheduledPublishDate = parsedScheduledDate;
    blog.publishedAt = publishedAt;
    Object.assign(blog, imageUpdate);

    // Backfill: if this blog never had a slug, clear it so the pre('save') hook regenerates one
    if (!blog.slug && blog.title) {
      blog.slug = undefined;
    }

    const updatedBlog = await blog.save();

    res.status(200).json({
      success: true,
      message: 'Blog post updated successfully',
      data: updatedBlog
    });
  } catch (error) {
    console.error('Update blog error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update blog post',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get all blog posts
 * @route   GET /api/blogs
 * @access  Public
 */
export const getAllBlogs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      sort = '-createdAt',
      status,
      category,
      tag,
      search
    } = req.query;

    const query = {};

    // Status filtering:
    // - Public site never sends `status` -> default to only published, non-future posts
    // - Admin dashboard always sends `status` (possibly '' to mean "all statuses")
    if (status === undefined) {
      // Public request: only show posts that are actually published
      // For blogs without publishedAt, use createdAt as fallback
      query.status = 'published';
      query.$or = [
        { publishedAt: { $lte: new Date() } },
        { publishedAt: { $exists: false } }
      ];
    } else if (status !== '') {
      // Admin filtering by a specific status
      query.status = status;
    }
    // status === '' -> admin wants all statuses, no filter applied

    if (category) query.category = category;
    if (tag) query.tags = tag;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } }
      ];
    }

    const blogs = await Blog.find(query)
      .populate('author', 'name username avatar')
      .sort(sort)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .select('-content');

    const total = await Blog.countDocuments(query);
    const totalPages = Math.ceil(total / parseInt(limit));

    res.status(200).json({
      success: true,
      count: blogs.length,
      total,
      totalPages,
      currentPage: parseInt(page),
      data: blogs
    });
  } catch (error) {
    console.error('Get all blogs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch blogs',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get single blog post by slug
 * @route   GET /api/blogs/:slug
 * @access  Public
 */
export const getBlogBySlug = async (req, res) => {
  try {
    const { slug } = req.params;

    const blog = await Blog.findOne({ slug })
      .populate('author', 'name username avatar bio');

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog post not found'
      });
    }

    await Blog.findByIdAndUpdate(blog._id, { $inc: { views: 1 } });

    res.status(200).json({
      success: true,
      data: blog
    });
  } catch (error) {
    console.error('Get blog by slug error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch blog post',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get single blog post by ID
 * @route   GET /api/blogs/id/:id
 * @access  Public
 */
export const getBlogById = async (req, res) => {
  try {
    const { id } = req.params;

    const blog = await Blog.findById(id);

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog post not found'
      });
    }

    res.status(200).json({
      success: true,
      data: blog.toJSON()
    });
  } catch (error) {
    console.error('Get blog by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch blog post'
    });
  }
};

/**
 * @desc    Delete blog post - FIXED with R2
 * @route   DELETE /api/blogs/:id
 * @access  Private/Admin
 */
export const deleteBlog = async (req, res) => {
  try {
    const { id } = req.params;

    const blog = await Blog.findById(id);
    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog post not found'
      });
    }

    if (blog.author.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this blog'
      });
    }

    // Track deleted files
    let deletedCount = 0;
    const deletedFiles = [];

    // Delete main blog image from R2
    if (blog.image) {
      console.log(`🗑️ Deleting main blog image: ${blog.image}`);
      const deleted = await deleteImageFromR2(blog.image);
      if (deleted) {
        deletedCount++;
        deletedFiles.push(blog.image);
      }
    }

    // Delete OG image from R2 if it exists and is different from main image
    if (blog.ogImage && blog.ogImage !== blog.image) {
      console.log(`🗑️ Deleting OG image: ${blog.ogImage}`);
      const deleted = await deleteImageFromR2(blog.ogImage);
      if (deleted) {
        deletedCount++;
        deletedFiles.push(blog.ogImage);
      }
    }

    // Delete the blog from database
    await blog.deleteOne();

    console.log(`✅ Blog deleted from database: ${id}`);
    console.log(`✅ Deleted ${deletedCount} image files from R2: ${deletedFiles.join(', ')}`);

    res.status(200).json({
      success: true,
      message: `Blog post deleted successfully. Removed ${deletedCount} image file(s) from R2.`,
      data: {
        blogId: id,
        deletedFiles: deletedFiles,
        deletedCount: deletedCount
      }
    });
  } catch (error) {
    console.error('Delete blog error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete blog post',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Like/Unlike blog post
 * @route   POST /api/blogs/:id/like
 * @access  Private
 */
export const toggleLike = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const blog = await Blog.findById(id);
    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog post not found'
      });
    }

    const isLiked = blog.likes.includes(userId);

    if (isLiked) {
      blog.likes = blog.likes.filter(likeId => likeId.toString() !== userId.toString());
    } else {
      blog.likes.push(userId);
    }

    await blog.save();

    res.status(200).json({
      success: true,
      message: isLiked ? 'Blog unliked' : 'Blog liked',
      likesCount: blog.likes.length,
      isLiked: !isLiked
    });
  } catch (error) {
    console.error('Toggle like error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update like status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * @desc    Get blog categories
 * @route   GET /api/blogs/categories
 * @access  Public
 */
export const getBlogCategories = async (req, res) => {
  try {
    const categories = await Blog.distinct('category');
    
    res.status(200).json({
      success: true,
      count: categories.length,
      data: categories.filter(cat => cat).sort()
    });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories'
    });
  }
};

/**
 * @desc    Get blog tags
 * @route   GET /api/blogs/tags
 * @access  Public
 */
export const getBlogTags = async (req, res) => {
  try {
    const tags = await Blog.aggregate([
      { $match: { status: 'published' } },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $project: { tag: '$_id', count: 1, _id: 0 } }
    ]);

    res.status(200).json({
      success: true,
      count: tags.length,
      data: tags
    });
  } catch (error) {
    console.error('Get tags error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tags'
    });
  }
};

/**
 * @desc    Get related blogs
 * @route   GET /api/blogs/:id/related
 * @access  Public
 */
export const getRelatedBlogs = async (req, res) => {
  try {
    const { id } = req.params;
    const limit = parseInt(req.query.limit) || 4;

    const blog = await Blog.findById(id);
    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog post not found'
      });
    }

    const relatedBlogs = await Blog.find({
      _id: { $ne: id }
    })
    .limit(limit)
    .select('title slug image description excerpt publishedAt readTime views')
    .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: relatedBlogs.length,
      data: relatedBlogs
    });
  } catch (error) {
    console.error('Get related blogs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch related blogs'
    });
  }
};

export const uploadBlogImage = (req, res, next) => next();