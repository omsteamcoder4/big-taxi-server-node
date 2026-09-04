// models/CategoryModel.js
import mongoose from 'mongoose';
import slugify from 'slugify';

const categorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please enter category name'],
        trim: true,
        unique: true,
        maxlength: [50, 'Category name cannot exceed 50 characters']
    },
    slug: {
        type: String,
        unique: true
    },
    image: {
        type: String,
        default: ''
    },
    parent: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category',
        default: null
    },
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active'
    },
    featured: {
        type: Boolean,
        default: false
    },
    displayOrder: {
        type: Number,
        default: 0
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// ✅ Virtual for subcategories
categorySchema.virtual('subcategories', {
    ref: 'Category',
    localField: '_id',
    foreignField: 'parent'
});

// ✅ Virtual for products count
categorySchema.virtual('productsCount', {
    ref: 'Product',
    localField: '_id',
    foreignField: 'category',
    count: true
});

// ✅ Automatically generate slug
categorySchema.pre('save', function (next) {
    if (this.isModified('name')) {
        this.slug = slugify(this.name, { lower: true, strict: true });
    }
    next();
});

// ✅ Prevent circular references
categorySchema.pre('save', function (next) {
    if (this.parent && this.parent.equals(this._id)) {
        return next(new Error('Category cannot be its own parent'));
    }
    next();
});

// ✅ Index for better performance
categorySchema.index({ parent: 1 });
categorySchema.index({ status: 1, featured: 1 });

export default mongoose.model('Category', categorySchema);