import mongoose from 'mongoose';

const fleetSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: [true, 'Fleet type is required'],
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
    shortDescription: {
      type: String,
      default: '',
    },
    capacity: {
      type: String,
      required: [true, 'Capacity is required'],
    },
    luggage: {
      type: String,
      required: [true, 'Luggage info is required'],
    },
    features: {
      type: [String],
      default: [],
    },
    ideal: {
      type: String,
      default: '',
    },
    image: {
      type: String,
      default: '',
    },
    images: {
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
    // SEO fields
    metaTitle: {
      type: String,
      default: '',
    },
    metaDescription: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

// Generate slug from type before saving
fleetSchema.pre('save', function(next) {
  if (this.isModified('type')) {
    this.slug = this.type
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
  next();
});

// Also generate slug on update
fleetSchema.pre('findOneAndUpdate', function(next) {
  const update = this.getUpdate();
  if (update.type) {
    update.slug = update.type
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
  next();
});

export default mongoose.model('Fleet', fleetSchema);