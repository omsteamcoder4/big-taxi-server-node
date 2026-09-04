import mongoose from 'mongoose';

const blogSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Blog title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  
  slug: {
    type: String,
    unique: true,
    lowercase: true,
    trim: true
  },
  
  image: {
    type: String,
    required: [true, 'Blog image is required']
  },
  
  imageAlt: {
    type: String,
    trim: true
  },
  
  description: {
    type: String,
    required: [true, 'Blog description is required'],
    trim: true
  },
  
  content: {
    type: String,
    required: [true, 'Blog content is required']
  },
  
  excerpt: {
    type: String,
    maxlength: [300, 'Excerpt cannot exceed 300 characters']
  },
  
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  authorName: {
    type: String,
    trim: true
  },
  
  category: {
    type: String,
    trim: true
  },
  
  tags: [{
    type: String,
    trim: true
  }],
  
  // SEO Fields
  metaTitle: {
    type: String,
    trim: true,
    maxlength: [70, 'Meta title cannot exceed 70 characters']
  },
  
  metaDescription: {
    type: String,
    trim: true,
    maxlength: [160, 'Meta description cannot exceed 160 characters']
  },
  
  metaKeywords: [{
    type: String,
    trim: true
  }],
  
  canonicalUrl: {
    type: String,
    trim: true
  },
  
  ogTitle: {
    type: String,
    trim: true
  },
  
  ogDescription: {
    type: String,
    trim: true
  },
  
  // Changed: ogImage now stores filename like image field
  ogImage: {
    type: String
  },
  
  // Status
  status: {
    type: String,
    enum: ['draft', 'published', 'archived', 'scheduled'],
    default: 'draft'
  },
  
  // Schedule Publish Date
  scheduledPublishDate: {
    type: Date,
    default: null
  },
  
  // Read time
  readTime: {
    type: Number,
    default: 0
  },
  
  // Stats
  views: {
    type: Number,
    default: 0
  },
  
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  comments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment'
  }],
  
  // Timestamps
  publishedAt: {
    type: Date
  }
  
}, {
  timestamps: true
});

// Generate slug before saving
blogSchema.pre('save', function() {
  if (this.title && !this.slug) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^\w\s]/gi, '')
      .replace(/\s+/g, '-')
      .substring(0, 50);
  }
  
  if (!this.excerpt && this.description) {
    this.excerpt = this.description.substring(0, 250) + '...';
  }
  
  // Calculate read time (assuming average reading speed of 200 words per minute)
  if (this.content) {
    const wordCount = this.content.split(/\s+/).length;
    this.readTime = Math.ceil(wordCount / 200);
  }
  
  // Set publishedAt when status changes to published
  if (this.isModified('status') && this.status === 'published' && !this.publishedAt) {
    this.publishedAt = new Date();
  }
  
  // Generate OG image from main image if not provided separately
  // Store filename only, not URL
  if (!this.ogImage && this.image) {
    this.ogImage = this.image;
  }
  
  // Generate meta fields if not provided
  if (!this.metaTitle && this.title) {
    this.metaTitle = this.title.substring(0, 65);
  }
  
  if (!this.metaDescription && this.description) {
    this.metaDescription = this.description.substring(0, 155);
  }
  
  if (!this.ogTitle && this.title) {
    this.ogTitle = this.title;
  }
  
  if (!this.ogDescription && this.description) {
    this.ogDescription = this.description.substring(0, 155);
  }
});

blogSchema.virtual('imageUrl').get(function() {
  if (!this.image) return null;
  // If it's already a full URL (e.g. R2), return it as-is.
  // Only prepend /uploads/ for legacy local filenames.
  if (/^https?:\/\//i.test(this.image)) return this.image;
  return `/uploads/${this.image}`;
});

// Virtual field for full OG image URL (for frontend use)
blogSchema.virtual('ogImageUrl').get(function() {
  if (!this.ogImage) return null;
  if (/^https?:\/\//i.test(this.ogImage)) return this.ogImage;
  return `/uploads/${this.ogImage}`;
});

// Enable virtual fields in JSON and Object responses
blogSchema.set('toJSON', { virtuals: true });
blogSchema.set('toObject', { virtuals: true });

// Indexes for better query performance
// ✅ FIXED: Removed duplicate slug index (unique: true already creates index)
blogSchema.index({ status: 1, publishedAt: -1 });
blogSchema.index({ author: 1 });
blogSchema.index({ category: 1 });
blogSchema.index({ tags: 1 });

const Blog = mongoose.model('Blog', blogSchema);
export default Blog;