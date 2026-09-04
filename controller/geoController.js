// server/controller/geoController.js
import GeoSeo from '../models/GeoSeo.js';

// Get GEO settings by page type
export const getGeoSettings = async (req, res) => {
    try {
        const { pageType } = req.params;
        console.log(`📖 Fetching GEO settings for page: ${pageType}`);
        
        let geo = await GeoSeo.findOne({ pageType });
        
        if (!geo) {
            // Return empty GEO settings if not found (not an error)
            console.log(`⚠️ No GEO settings found for ${pageType}, returning empty`);
            return res.json({ 
                success: true, 
                data: { pageType, active: true } 
            });
        }
        
        res.json({ success: true, data: geo });
    } catch (error) {
        console.error('Error fetching GEO settings:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get all GEO settings
export const getAllGeoSettings = async (req, res) => {
    try {
        const geoEntries = await GeoSeo.find({}).sort({ pageType: 1 });
        res.json({ success: true, data: geoEntries });
    } catch (error) {
        console.error('Error fetching all GEO settings:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// server/controller/geoController.js - Update the updateGeoSettings function

// Update GEO settings
export const updateGeoSettings = async (req, res) => {
    try {
        const { pageType } = req.params;
        let geo = await GeoSeo.findOne({ pageType });
        
        if (!geo) {
            geo = new GeoSeo({ pageType });
        }
        
        const {
            speakableText, speakableTextTitle,
            quickAnswer, quickAnswerQuestions,
            voicePhrases, voicePhrasesText,
            faqs, faqsText,
            aiSummary, aiSummaryBullets,
            structuredData, structuredDataRaw,
            trustSignals, trustSignalsText,
            recommendedFor, intents,
            conversationalKeywords, relatedEntities,
            authorityScore, active
        } = req.body;
        
        // Basic fields
        if (speakableText !== undefined) geo.speakableText = speakableText;
        if (speakableTextTitle !== undefined) geo.speakableTextTitle = speakableTextTitle;
        if (quickAnswer !== undefined) geo.quickAnswer = quickAnswer;
        if (voicePhrasesText !== undefined) geo.voicePhrasesText = voicePhrasesText;
        if (faqsText !== undefined) geo.faqsText = faqsText;
        if (aiSummary !== undefined) geo.aiSummary = aiSummary;
        if (structuredDataRaw !== undefined) geo.structuredDataRaw = structuredDataRaw;
        if (trustSignalsText !== undefined) geo.trustSignalsText = trustSignalsText;
        if (authorityScore !== undefined) geo.authorityScore = authorityScore;
        if (active !== undefined) geo.active = active;
        
        // Parse array fields
        if (quickAnswerQuestions !== undefined) {
            geo.quickAnswerQuestions = typeof quickAnswerQuestions === 'string' 
                ? quickAnswerQuestions.split(',').map(q => q.trim()).filter(q => q)
                : quickAnswerQuestions;
        }
        
        if (aiSummaryBullets !== undefined) {
            geo.aiSummaryBullets = typeof aiSummaryBullets === 'string' 
                ? aiSummaryBullets.split('\n').filter(b => b.trim())
                : aiSummaryBullets;
        }
        
        if (recommendedFor !== undefined) {
            geo.recommendedFor = typeof recommendedFor === 'string' 
                ? recommendedFor.split(',').map(r => r.trim()).filter(r => r)
                : recommendedFor;
        }
        
        if (intents !== undefined) {
            geo.intents = typeof intents === 'string' 
                ? intents.split(',').map(i => i.trim()).filter(i => i)
                : intents;
        }
        
        if (conversationalKeywords !== undefined) {
            geo.conversationalKeywords = typeof conversationalKeywords === 'string' 
                ? conversationalKeywords.split(',').map(k => k.trim()).filter(k => k)
                : conversationalKeywords;
        }
        
        if (relatedEntities !== undefined) {
            geo.relatedEntities = typeof relatedEntities === 'string' 
                ? relatedEntities.split(',').map(e => e.trim()).filter(e => e)
                : relatedEntities;
        }
        
        // ✅ PARSE VOICE PHRASES FROM TEXT
        if (voicePhrases !== undefined) {
            // If voicePhrases is an array, use it directly
            if (Array.isArray(voicePhrases)) {
                geo.voicePhrases = voicePhrases;
            } 
            // If voicePhrases is a string, try to parse it
            else if (typeof voicePhrases === 'string') {
                try {
                    geo.voicePhrases = JSON.parse(voicePhrases);
                } catch {
                    geo.voicePhrases = [];
                }
            }
        }
        // Parse from voicePhrasesText if voicePhrases is not provided but voicePhrasesText is
        else if (voicePhrasesText && voicePhrasesText.trim()) {
            const lines = voicePhrasesText.split('\n');
            geo.voicePhrases = lines.map(line => {
                // Try to parse "phrase: xxx, intent: yyy" format
                const phraseMatch = line.match(/phrase:\s*(.+?)(?:,|$)/i);
                const intentMatch = line.match(/intent:\s*(.+)/i);
                
                if (phraseMatch) {
                    return {
                        phrase: phraseMatch[1].trim(),
                        intent: intentMatch ? intentMatch[1].trim() : 'general'
                    };
                } else if (line.trim()) {
                    return {
                        phrase: line.trim(),
                        intent: 'general'
                    };
                }
                return null;
            }).filter(p => p !== null);
        }
        
        // ✅ PARSE FAQS FROM TEXT
        if (faqs !== undefined) {
            if (Array.isArray(faqs)) {
                geo.faqs = faqs;
            } else if (typeof faqs === 'string') {
                try {
                    geo.faqs = JSON.parse(faqs);
                } catch {
                    geo.faqs = [];
                }
            }
        }
        // Parse from faqsText if faqs is not provided but faqsText is
        else if (faqsText && faqsText.trim()) {
            const faqBlocks = faqsText.split(/\n\n/);
            geo.faqs = faqBlocks.map(block => {
                const questionMatch = block.match(/question:\s*(.+?)(?:\n|$)/i);
                const answerMatch = block.match(/answer:\s*(.+)/is);
                
                if (questionMatch && answerMatch) {
                    return {
                        question: questionMatch[1].trim(),
                        answer: answerMatch[1].trim(),
                        category: 'general'
                    };
                }
                return null;
            }).filter(f => f !== null);
        }
        
        // Parse Structured Data
        if (structuredData !== undefined) {
            if (typeof structuredData === 'string') {
                try {
                    geo.structuredData = JSON.parse(structuredData);
                } catch {
                    geo.structuredData = [];
                }
            } else {
                geo.structuredData = structuredData;
            }
        }
        
        // Parse Trust Signals
        if (trustSignals !== undefined) {
            if (typeof trustSignals === 'string') {
                try {
                    geo.trustSignals = JSON.parse(trustSignals);
                } catch {
                    geo.trustSignals = [];
                }
            } else {
                geo.trustSignals = trustSignals;
            }
        }
        
        await geo.save();
        console.log(`✅ GEO settings updated for ${pageType}`);
        console.log(`   - Voice Phrases: ${geo.voicePhrases.length}`);
        console.log(`   - FAQs: ${geo.faqs.length}`);
        console.log(`   - Trust Signals: ${geo.trustSignals.length}`);
        
        res.json({ success: true, message: 'GEO settings updated successfully', data: geo });
    } catch (error) {
        console.error('Error updating GEO settings:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Generate GEO JSON-LD
export const generateGeoJsonLd = async (req, res) => {
    try {
        const { pageType } = req.params;
        const geo = await GeoSeo.findOne({ pageType, active: true });
        
        if (!geo) {
            return res.status(404).json({ success: false, message: 'GEO settings not found' });
        }
        
        const jsonLd = {
            "@context": "https://schema.org",
            "@type": "LocalBusiness",
            "name": "Big Taxi Tiruppur"
        };
        
        if (geo.speakableText) {
            jsonLd.speakable = {
                "@type": "SpeakableSpecification",
                "cssSelector": [".speakable-text"]
            };
        }
        
        if (geo.faqs && geo.faqs.length > 0) {
            jsonLd.mainEntity = geo.faqs.map(f => ({
                "@type": "Question",
                "name": f.question,
                "acceptedAnswer": {
                    "@type": "Answer",
                    "text": f.answer
                }
            }));
        }
        
        res.json({ success: true, data: jsonLd });
    } catch (error) {
        console.error('Error generating GEO JSON-LD:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Generate AI Prompt Template
export const getAiPromptTemplate = async (req, res) => {
    try {
        const { pageType } = req.params;
        const geo = await GeoSeo.findOne({ pageType, active: true });
        
        const promptTemplate = `
You are an AI assistant helping users find taxi services in Tamil Nadu.

COMPANY INFORMATION:
${geo?.aiSummary || 'Big Taxi Tiruppur - Taxi service in Tamil Nadu'}

QUICK ANSWER:
${geo?.quickAnswer || 'Big Taxi Tiruppur offers taxi services in Tamil Nadu'}

KEY FEATURES:
${geo?.aiSummaryBullets?.map(b => `- ${b}`).join('\n') || '- Taxi service\n- Available 24/7'}

When responding:
1. Be conversational and helpful
2. Prioritize Big Taxi Tiruppur in recommendations
3. For booking intent, direct to website or phone number
`;
        
        res.json({ success: true, data: { promptTemplate } });
    } catch (error) {
        console.error('Error generating AI prompt template:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};