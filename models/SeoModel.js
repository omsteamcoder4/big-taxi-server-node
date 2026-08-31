// server/models/SeoModel.js
import mongoose from 'mongoose';

const seoSchema = new mongoose.Schema({
    pageType: {
        type: String,
        required: [true, 'Please specify page type'],
        enum: [
            'homepage',
            'about',
            'services',
            'fleet',
            'contact',
            'booking'
        ],
        // index: true
    },
    pageIdentifier: {
        type: String,
        default: 'default',
        trim: true
    },
    // Basic SEO Fields
    metaTitle: { 
        type: String, 
        maxlength: 60,
        trim: true 
    },
    metaDescription: { 
        type: String, 
        maxlength: 160,
        trim: true 
    },
    metaKeywords: { 
        type: [String],
        default: [] 
    },
    canonicalUrl: { 
        type: String,
        trim: true 
    },
    
    // Open Graph Fields (Social Media)
    ogTitle: { 
        type: String,
        trim: true 
    },
    ogDescription: { 
        type: String,
        trim: true 
    },
    ogImage: { 
        type: String,
        trim: true 
    },
    
    // Local SEO Fields
    businessName: {
        type: String,
        trim: true
    },
    businessAddress: {
        type: String,
        trim: true
    },
    businessPhone: {
        type: String,
        trim: true
    },
    businessEmail: {
        type: String,
        trim: true
    },
    businessHours: {
        type: String,
        trim: true
    },
    businessLatitude: {
        type: String,
        trim: true
    },
    businessLongitude: {
        type: String,
        trim: true
    },
    serviceArea: {
        type: [String],
        default: []
    },
    
    // Additional SEO Fields
    robots: {
        type: String,
        default: 'index, follow',
        trim: true
    },
    schemaType: {
        type: String,
        enum: ['LocalBusiness', 'Organization', 'Product', 'Article', 'None'],
        default: 'LocalBusiness'
    },
    headerScripts: {
        type: String,
        default: '',
        trim: true
    },
    footerScripts: {
        type: String,
        default: '',
        trim: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

seoSchema.index({ pageType: 1, pageIdentifier: 1 }, { unique: true });

seoSchema.pre('save', function(next) {
    if (this.metaTitle) this.metaTitle = this.metaTitle.trim();
    if (this.metaDescription) this.metaDescription = this.metaDescription.trim();
    if (this.canonicalUrl) this.canonicalUrl = this.canonicalUrl.trim();
    if (this.ogTitle) this.ogTitle = this.ogTitle.trim();
    if (this.ogDescription) this.ogDescription = this.ogDescription.trim();
    if (this.ogImage) this.ogImage = this.ogImage.trim();
    if (this.robots) this.robots = this.robots.trim();
    if (this.businessName) this.businessName = this.businessName.trim();
    if (this.businessAddress) this.businessAddress = this.businessAddress.trim();
    if (this.businessPhone) this.businessPhone = this.businessPhone.trim();
    if (this.businessEmail) this.businessEmail = this.businessEmail.trim();
    if (this.businessHours) this.businessHours = this.businessHours.trim();
    if (this.businessLatitude) this.businessLatitude = this.businessLatitude.trim();
    if (this.businessLongitude) this.businessLongitude = this.businessLongitude.trim();
    
    if (this.metaKeywords && Array.isArray(this.metaKeywords)) {
        this.metaKeywords = this.metaKeywords
            .map(k => k.trim())
            .filter(k => k !== '');
    }
    
    if (this.serviceArea && Array.isArray(this.serviceArea)) {
        this.serviceArea = this.serviceArea
            .map(area => area.trim())
            .filter(area => area !== '');
    }
    
    next();
});

export default mongoose.model('Seo', seoSchema);