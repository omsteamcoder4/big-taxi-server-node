// server/controller/aeoController.js
import AeoSeo from '../models/AeoSeo.js';

// Get AEO settings by page type
export const getAeoByPage = async (req, res) => {
    try {
        const { pageType } = req.params;
        let aeo = await AeoSeo.findOne({ pageType, active: true });
        
        if (!aeo) {
            // Create default AEO settings
            aeo = await AeoSeo.create({
                pageType,
                faqQuestions: [],
                howToSteps: [],
                voiceSearchKeywords: [],
                voiceSearchQuestions: []
            });
        }
        
        res.json({ success: true, data: aeo });
    } catch (error) {
        console.error('Error fetching AEO settings:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Update AEO settings
export const updateAeo = async (req, res) => {
    try {
        const { pageType } = req.params;
        let aeo = await AeoSeo.findOne({ pageType });
        
        if (!aeo) {
            aeo = new AeoSeo({ pageType });
        }
        
        const {
            faqQuestions, howToSteps, qaQuestions, articleBody,
            articleHeadline, articleSection, featuredSnippetText,
            featuredSnippetQuestion, voiceSearchKeywords, voiceSearchQuestions,
            naturalLanguagePhrases, semanticKeywords, schemaType, active
        } = req.body;
        
        // Update fields
        if (articleBody !== undefined) aeo.articleBody = articleBody;
        if (articleHeadline !== undefined) aeo.articleHeadline = articleHeadline;
        if (articleSection !== undefined) aeo.articleSection = articleSection;
        if (featuredSnippetText !== undefined) aeo.featuredSnippetText = featuredSnippetText;
        if (featuredSnippetQuestion !== undefined) aeo.featuredSnippetQuestion = featuredSnippetQuestion;
        if (schemaType !== undefined) aeo.schemaType = schemaType;
        if (active !== undefined) aeo.active = active;
        
        // Parse JSON arrays
        if (faqQuestions) {
            aeo.faqQuestions = typeof faqQuestions === 'string' ? JSON.parse(faqQuestions) : faqQuestions;
        }
        if (howToSteps) {
            aeo.howToSteps = typeof howToSteps === 'string' ? JSON.parse(howToSteps) : howToSteps;
        }
        if (qaQuestions) {
            aeo.qaQuestions = typeof qaQuestions === 'string' ? JSON.parse(qaQuestions) : qaQuestions;
        }
        if (voiceSearchKeywords) {
            aeo.voiceSearchKeywords = typeof voiceSearchKeywords === 'string' ? voiceSearchKeywords.split(',').map(k => k.trim()) : voiceSearchKeywords;
        }
        if (voiceSearchQuestions) {
            aeo.voiceSearchQuestions = typeof voiceSearchQuestions === 'string' ? voiceSearchQuestions.split(',').map(q => q.trim()) : voiceSearchQuestions;
        }
        if (naturalLanguagePhrases) {
            aeo.naturalLanguagePhrases = typeof naturalLanguagePhrases === 'string' ? naturalLanguagePhrases.split(',').map(p => p.trim()) : naturalLanguagePhrases;
        }
        if (semanticKeywords) {
            aeo.semanticKeywords = typeof semanticKeywords === 'string' ? semanticKeywords.split(',').map(k => k.trim()) : semanticKeywords;
        }
        
        await aeo.save();
        res.json({ success: true, message: 'AEO settings updated successfully', data: aeo });
    } catch (error) {
        console.error('Error updating AEO settings:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Generate FAQ Schema
export const generateFAQSchema = async (req, res) => {
    try {
        const { pageType } = req.params;
        const aeo = await AeoSeo.findOne({ pageType, active: true });
        
        if (!aeo || !aeo.faqQuestions || aeo.faqQuestions.length === 0) {
            return res.status(404).json({ success: false, message: 'No FAQ questions found' });
        }
        
        const schema = {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": aeo.faqQuestions.map(q => ({
                "@type": "Question",
                "name": q.question,
                "acceptedAnswer": {
                    "@type": "Answer",
                    "text": q.answer
                }
            }))
        };
        
        res.json({ success: true, data: schema });
    } catch (error) {
        console.error('Error generating FAQ schema:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Generate HowTo Schema
export const generateHowToSchema = async (req, res) => {
    try {
        const { pageType } = req.params;
        const aeo = await AeoSeo.findOne({ pageType, active: true });
        
        if (!aeo || !aeo.howToSteps || aeo.howToSteps.length === 0) {
            return res.status(404).json({ success: false, message: 'No HowTo steps found' });
        }
        
        const schema = {
            "@context": "https://schema.org",
            "@type": "HowTo",
            "name": `How to ${aeo.pageType === 'booking' ? 'Book a Taxi with Big Taxi Tiruppur' : 'Use Our Services'}`,
            "step": aeo.howToSteps.map((step, index) => ({
                "@type": "HowToStep",
                "position": index + 1,
                "name": step.name,
                "text": step.text,
                ...(step.image && { "image": step.image })
            }))
        };
        
        res.json({ success: true, data: schema });
    } catch (error) {
        console.error('Error generating HowTo schema:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// Generate Article Schema for featured snippets
export const generateArticleSchema = async (req, res) => {
    try {
        const { pageType } = req.params;
        const aeo = await AeoSeo.findOne({ pageType, active: true });
        
        if (!aeo || !aeo.articleBody) {
            return res.status(404).json({ success: false, message: 'No article content found' });
        }
        
        const schema = {
            "@context": "https://schema.org",
            "@type": "Article",
            "headline": aeo.articleHeadline || aeo.featuredSnippetQuestion || `${pageType.charAt(0).toUpperCase() + pageType.slice(1)} Guide`,
            "articleBody": aeo.articleBody,
            "articleSection": aeo.articleSection || pageType,
            "datePublished": aeo.createdAt,
            "dateModified": aeo.updatedAt
        };
        
        res.json({ success: true, data: schema });
    } catch (error) {
        console.error('Error generating Article schema:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};