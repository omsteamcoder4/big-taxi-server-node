// models/ServiceModel.js - FIXED
import mongoose from 'mongoose';

const serviceSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Service title is required'],
      trim: true,
      unique: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
    },
    image: {
      type: String,
      default: '',
    },
    features: {
      type: [String],
      default: [],
    },
    bulletPoints: {
      type: [String],
      default: [],
    },
    displayOrder: {
      type: Number,
      default: 0,
    },
    active: {
      type: Boolean,
      default: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    location: {
      type: String,
      default: '',
      trim: true,
      lowercase: true
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
  },
  { timestamps: true }
);

// Auto-generate slug from title before saving
serviceSchema.pre('validate', function(next) {
  if (this.isModified('title') || !this.slug) {
    this.slug = this.title
      ? this.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      : '';
  }
  next();
});

// Also generate slug if title is set and slug is empty
serviceSchema.pre('save', function(next) {
  if (!this.slug && this.title) {
    this.slug = this.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
  next();
});

export default mongoose.model('Service', serviceSchema);