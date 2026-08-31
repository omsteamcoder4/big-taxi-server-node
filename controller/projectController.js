
import Project from '../models/projectModel.js';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

// ── Image helpers ──────────────────────────────────────────────
const deleteImageFile = (imagePath) => {
  if (!imagePath) return;
  try {
    const fullPath = path.join(process.cwd(), imagePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      console.log('✅ Deleted project image:', fullPath);
    }
  } catch (err) {
    console.error('❌ Error deleting project image:', err);
  }
};

const processAndSaveImage = async (fileBuffer, oldImagePath = null) => {
  if (oldImagePath) deleteImageFile(oldImagePath);

  const uploadDir = 'uploads/projects';
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  const filename = `project_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.webp`;
  const filepath = path.join(uploadDir, filename);

  let quality = 80;
  let buffer = await sharp(fileBuffer)
    .resize(900, 600, { fit: 'cover', withoutEnlargement: true })
    .webp({ quality, effort: 6 })
    .toBuffer();

  // keep under 80KB
  while (buffer.length / 1024 > 80 && quality > 40) {
    quality -= 10;
    buffer = await sharp(fileBuffer)
      .resize(900, 600, { fit: 'cover', withoutEnlargement: true })
      .webp({ quality, effort: 6 })
      .toBuffer();
  }

  await fs.promises.writeFile(filepath, buffer);
  console.log(`✅ Saved project image: ${filename} (${(buffer.length / 1024).toFixed(1)}KB)`);
  return `/uploads/projects/${filename}`;
};

// ── Controller ────────────────────────────────────────────────

// GET /api/projects  (public — returns active projects only)
export const getAllProjects = async (req, res) => {
  try {
    const { category, includeInactive } = req.query;
    const query = {};
    if (includeInactive !== 'true' && includeInactive !== true) {
        query.active = true;
        }
    if (category && category !== 'all') query.category = category;

    const projects = await Project.find(query)
    .populate('category')
    .sort({ displayOrder: 1, createdAt: -1 });

    res.json({ success: true, count: projects.length, data: projects });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/projects/:id
export const getProjectById = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });
    res.json({ success: true, data: project });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/projects  (admin only)
export const createProject = async (req, res) => {
  try {
    const { name, category, location, units, status, year, area, whatsappNumber, displayOrder } = req.body;

    if (!name || !location || !category) {
      return res.status(400).json({ success: false, message: 'Name, category and location are required' });
    }

    let imagePath = '';
    if (req.file) {
      imagePath = await processAndSaveImage(req.file.buffer);
    }

    const project = await Project.create({
      name: name.trim(),
      category,
      location: location.trim(),
      units: units || '',
      status: status || 'Ongoing',
      year: year || '',
      area: area || '',
      image: imagePath,
      whatsappNumber: whatsappNumber || '919992322230',
      displayOrder: parseInt(displayOrder) || 0,
      createdBy: req.user?._id
    });

    const populatedProject = await Project.findById(project._id)
  .populate('category');

    res.status(201).json({ success: true, message: 'Project created successfully', data: populatedProject });
  } catch (err) {
    console.error('❌ Create Project Error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
};

// PUT /api/projects/:id  (admin only)
export const updateProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });

    const { name, category, location, units, status, year, area, whatsappNumber, displayOrder, active } = req.body;

    if (name !== undefined) project.name = name.trim();
    if (category !== undefined) project.category = category;
    if (location !== undefined) project.location = location.trim();
    if (units !== undefined) project.units = units;
    if (status !== undefined) project.status = status;
    if (year !== undefined) project.year = year;
    if (area !== undefined) project.area = area;
    if (whatsappNumber !== undefined) project.whatsappNumber = whatsappNumber;
    if (displayOrder !== undefined) project.displayOrder = parseInt(displayOrder) || 0;
    if (active !== undefined) project.active = active === 'true' || active === true;

    if (req.file) {
      project.image = await processAndSaveImage(req.file.buffer, project.image);
    }

    const updated = await project.save();
    const populatedProject = await Project.findById(project._id)
  .populate('category');
    res.json({ success: true, message: 'Project updated successfully', data: populatedProject });
  } catch (err) {
    console.error('❌ Update Project Error:', err);
    res.status(400).json({ success: false, message: err.message });
  }
};

// DELETE /api/projects/:id  (admin only)
export const deleteProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ success: false, message: 'Project not found' });

    if (project.image) deleteImageFile(project.image);

    await Project.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Project deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};