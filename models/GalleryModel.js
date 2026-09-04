// models/GalleryModel.js
import mongoose from 'mongoose';

const gallerySchema = new mongoose.Schema({
    image: {
        type: String,
        required: [true, 'Please upload an image']
    },
    altText: {
        type: String
    },
    caption: {
        type: String
    },
    title: {
        type: String
    },
    metaTitle: {
        type: String,
        maxlength: 60
    },
    metaDescription: {
        type: String,
        maxlength: 160
    },
    metaKeywords: {
        type: [String]
    },
    canonicalUrl: {
        type: String
    },
    ogTitle: {
        type: String
    },
    ogDescription: {
        type: String
    },
    ogImage: {
        type: String
    },
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active'
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

export default mongoose.model('Gallery', gallerySchema);