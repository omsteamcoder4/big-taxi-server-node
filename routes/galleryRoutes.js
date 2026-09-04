import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import sharp from 'sharp';

import {
    createGallery,
    getAllGalleries,
    getGalleryById,
    updateGallery,
    deleteGallery,
    getActiveGalleries
} from '../controller/galleryController.js';

import { protect, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

const uploadDir = 'uploads/';

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Store temp file first
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    const allowed = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
        'image/gif'
    ];

    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only images allowed'), false);
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }
});

// Convert to webp under 40KB
const processImage = async (buffer, filename) => {
    let quality = 80;
    let outputBuffer;

    do {
        outputBuffer = await sharp(buffer)
            .resize({ width: 1200, withoutEnlargement: true })
            .webp({ quality })
            .toBuffer();

        quality -= 5;

    } while (outputBuffer.length > 40000 && quality > 20);

    const filepath = path.join(uploadDir, filename);
    fs.writeFileSync(filepath, outputBuffer);

    return filename;
};

// Middleware convert image
const convertImages = async (req, res, next) => {
    try {
        if (!req.files) return next();

        for (const field in req.files) {
            for (const file of req.files[field]) {
                const random = crypto.randomBytes(4).toString('hex');
                const filename = `gallery-${Date.now()}-${random}-${field}.webp`;

                await processImage(file.buffer, filename);

                file.filename = filename;
                file.path = path.join(uploadDir, filename);
            }
        }

        next();
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
};

// Routes
router.get('/', getAllGalleries);
router.get('/active', getActiveGalleries);
router.get('/:id', getGalleryById);

router.post(
    '/',
    protect,
    authorize('admin'),
    upload.fields([
        { name: 'image', maxCount: 1 },
        { name: 'ogImage', maxCount: 1 }
    ]),
    convertImages,
    createGallery
);

router.put(
    '/:id',
    protect,
    authorize('admin'),
    upload.fields([
        { name: 'image', maxCount: 1 },
        { name: 'ogImage', maxCount: 1 }
    ]),
    convertImages,
    updateGallery
);

router.delete('/:id', protect, authorize('admin'), deleteGallery);

export default router;