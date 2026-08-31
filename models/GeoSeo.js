// server/models/GeoSeo.js - Generative Engine Optimization (GEO)
import mongoose from 'mongoose';

// FAQ Schema
const geoFaqSchema = new mongoose.Schema({
    question: { type: String, required: true },
    answer: { type: String, required: true },
    category: { type: String, default: 'general' }
});

// Voice Phrase Schema
const voicePhraseSchema = new mongoose.Schema({
    phrase: { type: String, required: true },
    intent: { type: String, default: 'general' }
});

// Trust Signal Schema
const trustSignalSchema = new mongoose.Schema({
    type: { type: String, required: true },
    value: { type: String, required: true },
    source: { type: String },
    isVisible: { type: Boolean, default: true }
});

// Structured Data Schema
const structuredDataSchema = new mongoose.Schema({
    type: { type: String, required: true },
    data: { type: mongoose.Schema.Types.Mixed, default: {} }
});

const geoSchema = new mongoose.Schema({
    pageType: {
        type: String,
        enum: ['homepage', 'about', 'services', 'fleet', 'contact', 'booking'],
        required: true
        // ✅ FIXED: Removed 'unique: true' to avoid duplicate index warning
    },
    
    // Speakable Text
    speakableText: { type: String, default: '' },
    speakableTextTitle: { type: String, default: '' },
    
    // Quick Answer
    quickAnswer: { type: String, default: '' },
    quickAnswerQuestions: { type: [String], default: [] },
    
    // Voice Phrases
    voicePhrases: [voicePhraseSchema],
    voicePhrasesText: { type: String, default: '' },
    
    // FAQs
    faqs: [geoFaqSchema],
    faqsText: { type: String, default: '' },
    
    // AI Summary
    aiSummary: { type: String, default: '' },
    aiSummaryBullets: { type: [String], default: [] },
    
    // Structured Data
    structuredData: [structuredDataSchema],
    structuredDataRaw: { type: String, default: '' },
    
    // Trust Signals
    trustSignals: [trustSignalSchema],
    trustSignalsText: { type: String, default: '' },
    
    // Additional GEO Fields
    recommendedFor: { type: [String], default: [] },
    intents: { type: [String], default: [] },
    conversationalKeywords: { type: [String], default: [] },
    relatedEntities: { type: [String], default: [] },
    authorityScore: { type: Number, default: 5 },
    
    active: { type: Boolean, default: true }
}, {
    timestamps: true
});

geoSchema.index({ pageType: 1 });

export default mongoose.model('GeoSeo', geoSchema);