// models/ProjectModel.js
import mongoose from 'mongoose';
import slugify from 'slugify';

const projectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Project name is required'],
    trim: true,
    maxlength: [100, 'Project name cannot exceed 100 characters']
  },
  slug: {
    type: String,
    unique: true
  },
  category: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'Category',
  required: true
},
  location: {
    type: String,
    required: [true, 'Location is required'],
    trim: true
  },
  units: {
    type: String,   // e.g. "120 apartments", "45 villas", "200 plots"
    trim: true,
    default: ''
  },
  status: {
    type: String,
    enum: ['Completed', 'Ongoing', 'Available', 'Upcoming'],
    default: 'Ongoing'
  },
  year: {
    type: String,   // e.g. "2023", "2024"
    trim: true,
    default: ''
  },
  area: {
    type: String,   // e.g. "2 & 3 BHK", "500-2000 sq.ft"
    trim: true,
    default: ''
  },
  image: {
    type: String,
    default: ''
  },
  whatsappNumber: {
    type: String,
    default: '919992322230'
  },
  displayOrder: {
    type: Number,
    default: 0
  },
  active: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Auto-generate slug from name
projectSchema.pre('save', function (next) {
  if (this.isModified('name')) {
    this.slug = slugify(this.name, { lower: true, strict: true });
  }
  next();
});

projectSchema.index({ category: 1, active: 1 });
projectSchema.index({ displayOrder: 1 });

export default mongoose.model('Project', projectSchema);