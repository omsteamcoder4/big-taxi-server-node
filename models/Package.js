import mongoose from 'mongoose';

const packageSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Package title is required'],
      trim: true,
      maxlength: 100,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    destination: {
      type: String,
      required: [true, 'Destination is required'],
      trim: true,
    },
    callForPrice: {
      type: Boolean,
      default: true,
    },
    features: {
      type: [String],
      default: [],
    },
    image: {
      type: String,
      default: '',
    },
    // Multiple images for gallery
    images: {
      type: [String],
      default: [],
    },
    // Detailed description
    detailedDescription: {
      type: String,
      default: '',
    },
    // Short description for cards
    shortDescription: {
      type: String,
      default: '',
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    active: {
      type: Boolean,
      default: true,
    },
    displayOrder: {
      type: Number,
      default: 0,
    },
    // SEO fields
    metaTitle: {
      type: String,
      default: '',
    },
    metaDescription: {
      type: String,
      default: '',
    },
    metaKeywords: {
      type: [String],
      default: [],
    },
    ogImage: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

// Generate slug from title before saving
packageSchema.pre('save', function(next) {
  if (this.isModified('title') && !this.slug) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
  next();
});

export default mongoose.model('Package', packageSchema);