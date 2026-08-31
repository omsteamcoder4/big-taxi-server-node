// server/models/AeoSeo.js
import mongoose from 'mongoose';

const aeoQuestionSchema = new mongoose.Schema({
    question: { type: String, required: true },
    answer: { type: String, required: true },
    upvoteCount: { type: Number, default: 0 },
    dateCreated: { type: Date, default: Date.now }
});

const howToStepSchema = new mongoose.Schema({
    name: { type: String, required: true },
    text: { type: String, required: true },
    image: { type: String },
    estimatedCost: { type: String }
});

const aeiSchema = new mongoose.Schema({
    // For which page type this AEO belongs to
    pageType: {
        type: String,
        enum: ['homepage', 'about', 'services', 'fleet', 'contact', 'booking'],
        required: true
        // ✅ FIXED: Removed 'index: true' to avoid duplicate index warning
    },
    
    // FAQ Schema (for voice search and featured snippets)
    faqQuestions: [aeoQuestionSchema],
    
    // HowTo Schema (for step-by-step instructions)
    howToSteps: [howToStepSchema],
    
    // Q&A Schema (for community questions)
    qaQuestions: [aeoQuestionSchema],
    
    // Article/Section for featured snippets
    articleBody: {
        type: String,
        default: ''
    },
    articleHeadline: {
        type: String,
        default: ''
    },
    articleSection: {
        type: String,
        default: ''
    },
    
    // Featured Snippet Optimization
    featuredSnippetText: {
        type: String,
        default: ''
    },
    featuredSnippetQuestion: {
        type: String,
        default: ''
    },
    
    // Voice Search Optimization
    voiceSearchKeywords: {
        type: [String],
        default: []
    },
    voiceSearchQuestions: {
        type: [String],
        default: []
    },
    
    // Natural Language Optimization
    naturalLanguagePhrases: {
        type: [String],
        default: []
    },
    
    // Semantic Search Keywords
    semanticKeywords: {
        type: [String],
        default: []
    },
    
    // Schema Type
    schemaType: {
        type: String,
        enum: ['FAQ', 'HowTo', 'QAPage', 'Article', 'None'],
        default: 'None'
    },
    
    active: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Index for quick lookups - FIXED: use aeiSchema instead of aeoSchema
aeiSchema.index({ pageType: 1 });

export default mongoose.model('AeoSeo', aeiSchema);