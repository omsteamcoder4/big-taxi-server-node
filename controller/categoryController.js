
import Category from '../models/CategoryModel.js';
import slugify from 'slugify';
import mongoose from 'mongoose';
import asyncHandler from 'express-async-handler';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

// Helper function to delete image file
const deleteImageFile = async (imagePath) => {
    if (imagePath && imagePath !== '') {
        try {
            const fullPath = path.join(process.cwd(), imagePath);
            if (fs.existsSync(fullPath)) {
                fs.unlinkSync(fullPath);
                console.log('Deleted image:', fullPath);
            }
        } catch (error) {
            console.error('Error deleting image:', error);
        }
    }
};

// Helper function to process and save image
const processAndSaveImage = async (fileBuffer, oldImagePath = null) => {
    try {
        // Delete old image if exists
        if (oldImagePath) {
            await deleteImageFile(oldImagePath);
        }

        // Generate unique filename
        const timestamp = Date.now();
        const randomString = Math.random().toString(36).substring(2, 8);
        const filename = `category_${timestamp}_${randomString}.webp`;
        const uploadDir = 'uploads/categories';
        
        // Ensure directory exists
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        
        const filepath = path.join(uploadDir, filename);
        
        // Process image with sharp - convert to WebP and optimize
        let quality = 80;
        let processedBuffer = await sharp(fileBuffer)
            .resize(800, 800, {
                fit: 'inside',
                withoutEnlargement: true
            })
            .webp({ 
                quality: quality,
                effort: 6
            })
            .toBuffer();
        
        // Check size and reduce quality if needed
        let sizeInKB = processedBuffer.length / 1024;
        while (sizeInKB > 40 && quality > 40) {
            quality -= 10;
            processedBuffer = await sharp(fileBuffer)
                .resize(800, 800, {
                    fit: 'inside',
                    withoutEnlargement: true
                })
                .webp({ 
                    quality: quality,
                    effort: 6
                })
                .toBuffer();
            sizeInKB = processedBuffer.length / 1024;
        }
        
        // Save the processed image
        await fs.promises.writeFile(filepath, processedBuffer);
        
        return `/uploads/categories/${filename}`;
    } catch (error) {
        console.error('Image processing error:', error);
        throw error;
    }
};

// ✅ Create Category (without description)
export const createCategory = async (req, res) => {
    try {
        const { name, parent, status, featured, displayOrder } = req.body;

        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'Category name is required'
            });
        }

        // Check if category already exists
        const existingCategory = await Category.findOne({ 
            $or: [
                { name: name.trim() },
                { slug: slugify(name, { lower: true, strict: true }) }
            ]
        });

        if (existingCategory) {
            return res.status(400).json({
                success: false,
                message: 'Category with this name already exists'
            });
        }

        let imagePath = '';
        
        // Process image if uploaded
        if (req.file) {
            try {
                imagePath = await processAndSaveImage(req.file.buffer);
            } catch (error) {
                return res.status(400).json({
                    success: false,
                    message: 'Failed to process image: ' + error.message
                });
            }
        }

        const category = new Category({
            name: name.trim(),
            image: imagePath,
            parent: parent || null,
            status: status || 'active',
            featured: featured === 'true' || featured === true,
            displayOrder: parseInt(displayOrder) || 0,
            createdBy: req.user?._id
        });

        const savedCategory = await category.save();
        
        if (savedCategory.parent) {
            await savedCategory.populate('parent', 'name slug');
        }

        res.status(201).json({
            success: true,
            message: 'Category created successfully',
            data: savedCategory
        });
    } catch (error) {
        console.error('❌ Create Category Error:', error);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// ✅ Get All Categories (without description)
export const getAllCategories = async (req, res) => {
    try {
        const { includeInactive, includeProductsCount } = req.query;
        
        let query = {};
        if (includeInactive !== 'true') {
            query.status = 'active';
        }

        const categories = await Category.find(query)
            .populate('parent', 'name slug')
            .populate(includeProductsCount === 'true' ? 'productsCount' : '')
            .sort({ displayOrder: 1, name: 1 });

        res.status(200).json({
            success: true,
            count: categories.length,
            data: categories
        });
    } catch (error) {
        console.error('❌ Get Categories Error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// ✅ Get Category by ID or Slug (without description)
export const getCategoryById = async (req, res) => {
    try {
        const { id } = req.params;
        
        let category;
        if (mongoose.Types.ObjectId.isValid(id)) {
            category = await Category.findById(id)
                .populate('parent', 'name slug')
                .populate('subcategories', 'name slug image status')
                .populate('productsCount');
        } else {
            category = await Category.findOne({ slug: id })
                .populate('parent', 'name slug')
                .populate('subcategories', 'name slug image status')
                .populate('productsCount');
        }

        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Category not found'
            });
        }

        res.status(200).json({
            success: true,
            data: category
        });
    } catch (error) {
        console.error('❌ Get Category Error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// ✅ Update Category (without description)
export const updateCategory = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, parent, status, featured, displayOrder } = req.body;

        const category = await Category.findById(id);
        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Category not found'
            });
        }

        // If name is being updated, check for duplicates
        if (name && name !== category.name) {
            const existingCategory = await Category.findOne({
                $and: [
                    { _id: { $ne: id } },
                    { 
                        $or: [
                            { name: name.trim() },
                            { slug: slugify(name, { lower: true, strict: true }) }
                        ]
                    }
                ]
            });

            if (existingCategory) {
                return res.status(400).json({
                    success: false,
                    message: 'Category with this name already exists'
                });
            }
            category.name = name.trim();
        }

        // Update fields
        if (parent !== undefined) category.parent = parent || null;
        if (status) category.status = status;
        if (featured !== undefined) category.featured = featured === 'true' || featured === true;
        if (displayOrder !== undefined) category.displayOrder = parseInt(displayOrder) || 0;

        // Handle image upload
        if (req.file) {
            try {
                // Process and save new image (this will delete the old one)
                const oldImagePath = category.image;
                const newImagePath = await processAndSaveImage(req.file.buffer, oldImagePath);
                category.image = newImagePath;
            } catch (error) {
                return res.status(400).json({
                    success: false,
                    message: 'Failed to process image: ' + error.message
                });
            }
        }

        const updatedCategory = await category.save();
        
        if (updatedCategory.parent) {
            await updatedCategory.populate('parent', 'name slug');
        }
        await updatedCategory.populate('subcategories', 'name slug');

        res.status(200).json({
            success: true,
            message: 'Category updated successfully',
            data: updatedCategory
        });
    } catch (error) {
        console.error('❌ Update Category Error:', error);
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};

// ✅ Delete Category with Image Deletion
export const deleteCategory = async (req, res) => {
    try {
        const { id } = req.params;

        const category = await Category.findById(id);
        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Category not found'
            });
        }

        // Check if category has subcategories
        const subcategories = await Category.find({ parent: id });
        if (subcategories.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete category with subcategories. Please delete subcategories first.'
            });
        }

        // Check if category has products
        const productsCount = await Product.countDocuments({ category: id });
        if (productsCount > 0) {
            return res.status(400).json({
                success: false,
                message: 'Cannot delete category with associated products. Please reassign or delete products first.'
            });
        }

        // Delete category image if exists
        if (category.image) {
            await deleteImageFile(category.image);
        }

        await Category.findByIdAndDelete(id);

        res.status(200).json({
            success: true,
            message: 'Category deleted successfully'
        });
    } catch (error) {
        console.error('❌ Delete Category Error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// ✅ Get Categories Tree (without description)
export const getCategoriesTree = async (req, res) => {
    try {
        const categories = await Category.find({ status: 'active' })
            .populate('parent', 'name slug')
            .sort({ displayOrder: 1, name: 1 });

        // Build tree structure
        const buildTree = (parentId = null) => {
            return categories
                .filter(cat => 
                    (parentId === null && !cat.parent) || 
                    (cat.parent && cat.parent._id.toString() === parentId)
                )
                .map(cat => ({
                    ...cat.toObject(),
                    subcategories: buildTree(cat._id.toString())
                }));
        };

        const tree = buildTree();

        res.status(200).json({
            success: true,
            data: tree
        });
    } catch (error) {
        console.error('❌ Get Categories Tree Error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// ✅ Get Category Products
export const getCategoryProducts = async (req, res) => {
    try {
        const { id } = req.params;
        const { page = 1, limit = 12, sort = '-createdAt' } = req.query;

        let category;
        if (mongoose.Types.ObjectId.isValid(id)) {
            category = await Category.findById(id);
        } else {
            category = await Category.findOne({ slug: id });
        }

        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Category not found'
            });
        }

        // Get all subcategory IDs including the main category
        const getSubcategoryIds = async (categoryId) => {
            const subcategories = await Category.find({ parent: categoryId }, '_id');
            let ids = [categoryId];
            for (const subcat of subcategories) {
                const subIds = await getSubcategoryIds(subcat._id);
                ids = [...ids, ...subIds];
            }
            return ids;
        };

        const categoryIds = await getSubcategoryIds(category._id);

        const products = await Product.find({ 
            category: { $in: categoryIds },
            status: 'active'
        })
        .populate('category', 'name slug')
        .populate('subcategory', 'name slug')
        .sort(sort)
        .limit(limit * 1)
        .skip((page - 1) * limit);

        const total = await Product.countDocuments({ 
            category: { $in: categoryIds },
            status: 'active'
        });

        res.status(200).json({
            success: true,
            data: {
                category,
                products,
                pagination: {
                    current: parseInt(page),
                    pages: Math.ceil(total / limit),
                    total
                }
            }
        });
    } catch (error) {
        console.error('❌ Get Category Products Error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// ✅ Get Active Categories Only (only name and image)
export const getActiveCategories = asyncHandler(async (req, res) => {
    const categories = await Category.find({ status: 'active' })
        .sort({ createdAt: 1 })
        .select('name slug image')  // ✅ Only name, slug, and image
        .populate('parent', 'name slug');

    res.status(200).json({
        success: true,
        count: categories.length,
        data: categories
    });
});