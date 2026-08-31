// controllers/blogController.js - R2 Integration
import Blog from '../models/Blog.js';
import { smartSizeOptimization } from '../middleware/uploadMiddleware.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';
import { uploadToR2, deleteFromR2, getR2Status } from '../utils/r2Client.js';

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
         url.startsWith('https://') && url.includes('.r2.');
};

/**
 * Delete image from R2 or local filesystem
 * @param {string} imagePath - The image URL or filename
 * @returns {Promise<boolean>} - True if deleted
 */
const deleteImageFile = async (imagePath) => {
  if (!imagePath) return false;

  try {
    console.log('🔍 Attempting to delete blog image:', imagePath);

    // If it's an R2 URL, delete from R2
    if (isR2Url(imagePath)) {
      console.log('📤 Deleting from R2:', imagePath);
      const result = await deleteFromR2(imagePath);
      if (result) {
        console.log('✅ DELETED from R2:', imagePath);
        return true;
      }
      return false;
    }

    // Otherwise, delete from local filesystem (backward compatibility)
    const uploadsFolder = path.join(process.cwd(), 'uploads');
    let filename = '';

    // Handle different path formats
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
    const exactFilePath = path.join(uploadsFolder, filename);

    if (fs.existsSync(exactFilePath)) {
      fs.unlinkSync(exactFilePath);
      console.log('✅ DELETED local blog image:', filename);
      return true;
    } else {
      console.log('❌ Local blog image not found:', filename);
      return false;
    }
  } catch (error) {
    console.error('❌ Error deleting blog image:', error);
    return false;
  }
};

/**
 * Upload an image to R2 and return the URL
 * @param {string} tempFilePath - Temporary file path from multer
 * @param {string} oldImageUrl - Optional old image URL to delete
 * @param {string} folder - Folder in R2 (default: 'blogs')
 * @returns {Promise<string>} - Public URL of the uploaded image
 */
const uploadBlogImageToR2 = async (tempFilePath, oldImageUrl = null, folder = 'blogs') => {
  try {
    // Delete old image if provided
    if (oldImageUrl) {
      await deleteImageFile(oldImageUrl);
    }

    // Read the file
    const fileBuffer = await fs.promises.readFile(tempFilePath);
    
    // Generate a unique filename
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const filename = `blog_${timestamp}_${random}.webp`;
    
    // Get file stats for logging
    const stats = fs.statSync(tempFilePath);
    console.log(`📤 Uploading blog image to R2: ${filename} (${(stats.size / 1024).toFixed(2)}KB)`);

    // Upload to R2
    const publicUrl = await uploadToR2(fileBuffer, filename, 'image/webp', folder);
    
    // Clean up temp file
    await fs.promises.unlink(tempFilePath).catch(() => {});
    
    console.log('✅ Blog image uploaded to R2:', publicUrl);
    return publicUrl;
    
  } catch (error) {
    console.error('❌ Error uploading blog image to R2:', error);
    // Clean up temp file if it exists
    await fs.promises.unlink(tempFilePath).catch(() => {});
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

// ============ APPLY OPTIMIZATION MIDDLEWARE ============

export const uploadBlogImage = smartSizeOptimization(50);

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

// ============ ORIGINAL FUNCTIONS (WITH R2 SUPPORT) ============

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
      ogDescription
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

    // Upload main image to R2
    const imageUrl = await uploadBlogImageToR2(blogImage.path, null, 'blogs');
    
    // Upload OG image if provided, otherwise use main image
    let ogImageUrl = imageUrl;
    if (ogImageFile) {
      ogImageUrl = await uploadBlogImageToR2(ogImageFile.path, null, 'blogs/og');
    }

    const blog = await Blog.create({
      title,
      description,
      content,
      image: imageUrl, // Now stores R2 URL
      imageAlt: imageAlt || title,
      excerpt: excerpt || description.substring(0, 250) + '...',
      author: req.user._id,
      authorName: req.user.name || req.user.username,
      category,
      tags: parsedTags,
      status: status || 'draft',
      metaTitle: metaTitle || '',
      metaDescription: metaDescription || '',
      metaKeywords: parsedMetaKeywords,
      canonicalUrl: canonicalUrl || '',
      ogTitle: ogTitle || '',
      ogDescription: ogDescription || '',
      ogImage: ogImageUrl // Now stores R2 URL
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
      deletedOgImage
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
        await deleteImageFile(blog.image);
        imageUpdate.image = null;
      }
    }
    
    if (deletedOgImage === 'true' || deletedOgImage === true) {
      if (blog.ogImage) {
        console.log('🗑️ Deleting OG image (explicit delete request):', blog.ogImage);
        await deleteImageFile(blog.ogImage);
        imageUpdate.ogImage = null;
      }
    }
    
    // Handle file uploads
    if (req.files && req.files.length > 0) {
      const blogImage = req.files.find(file => file.fieldname === 'image');
      const ogImageFile = req.files.find(file => file.fieldname === 'ogImage');
      
      // Upload new blog image if provided
      if (blogImage) {
        console.log('📤 Uploading new blog image to R2...');
        const imageUrl = await uploadBlogImageToR2(blogImage.path, blog.image, 'blogs');
        imageUpdate.image = imageUrl;
      }
      
      // Upload new OG image if provided
      if (ogImageFile) {
        console.log('📤 Uploading new OG image to R2...');
        const ogImageUrl = await uploadBlogImageToR2(ogImageFile.path, blog.ogImage, 'blogs/og');
        imageUpdate.ogImage = ogImageUrl;
      } else if (blogImage && !ogImageFile && !deletedOgImage) {
        // If only blog image is updated and no separate OG image upload
        if (!blog.ogImage || isR2Url(blog.ogImage) && blog.ogImage !== blog.image) {
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

    // Update blog
    const updatedBlog = await Blog.findByIdAndUpdate(
      id,
      {
        title: title || blog.title,
        description: description || blog.description,
        content: content || blog.content,
        imageAlt: imageAlt || blog.imageAlt,
        excerpt: excerpt || blog.excerpt,
        category: category || blog.category,
        tags: parsedTags,
        status: status || blog.status,
        metaTitle: metaTitle || blog.metaTitle,
        metaDescription: metaDescription || blog.metaDescription,
        metaKeywords: parsedMetaKeywords,
        canonicalUrl: canonicalUrl || blog.canonicalUrl,
        ogTitle: ogTitle || blog.ogTitle,
        ogDescription: ogDescription || blog.ogDescription,
        ...imageUpdate
      },
      { new: true, runValidators: true }
    );

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
      sort = '-createdAt'
    } = req.query;

    const query = {};

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
 * @desc    Delete blog post - With R2 support
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

    // Delete main blog image (R2 or local)
    if (blog.image) {
      console.log(`🗑️ Deleting blog image: ${blog.image}`);
      const deleted = await deleteImageFile(blog.image);
      if (deleted) {
        deletedCount++;
        deletedFiles.push(blog.image);
      }
    }

    // Delete OG image if it exists and is different from main image
    if (blog.ogImage && blog.ogImage !== blog.image) {
      console.log(`🗑️ Deleting OG image: ${blog.ogImage}`);
      const deleted = await deleteImageFile(blog.ogImage);
      if (deleted) {
        deletedCount++;
        deletedFiles.push(blog.ogImage);
      }
    }

    // Delete the blog from database
    await blog.deleteOne();

    console.log(`✅ Blog deleted from database: ${id}`);
    console.log(`✅ Deleted ${deletedCount} image files: ${deletedFiles.join(', ')}`);

    res.status(200).json({
      success: true,
      message: `Blog post deleted successfully. Removed ${deletedCount} image file(s) from storage.`,
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