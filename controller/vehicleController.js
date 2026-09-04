import Vehicle from '../models/Vehicle.js';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const deleteImageFile = (imagePath) => {
  if (!imagePath) return;
  try {
    const fullPath = path.join(process.cwd(), imagePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      console.log('✅ Deleted vehicle image:', fullPath);
    }
  } catch (err) {
    console.error('❌ Error deleting vehicle image:', err);
  }
};

const processImage = async (fileBuffer, oldImagePath = null) => {
  if (oldImagePath) deleteImageFile(oldImagePath);

  const uploadDir = 'uploads/vehicles';
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  const filename = `vehicle_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.webp`;
  const filepath = path.join(uploadDir, filename);

  let quality = 80;
  let buffer = await sharp(fileBuffer)
    .resize(800, 500, { fit: 'cover', withoutEnlargement: true })
    .webp({ quality, effort: 6 })
    .toBuffer();

  while (buffer.length / 1024 > 40 && quality > 20) {
    quality -= 10;
    buffer = await sharp(fileBuffer)
      .resize(800, 500, { fit: 'cover', withoutEnlargement: true })
      .webp({ quality, effort: 6 })
      .toBuffer();
  }

  await fs.promises.writeFile(filepath, buffer);
  console.log(`✅ Saved vehicle image: ${filename} (${(buffer.length / 1024).toFixed(1)}KB)`);
  return `/uploads/vehicles/${filename}`;
};

// Public – get all active vehicles
export const getAllVehicles = async (req, res) => {
  try {
    const { includeInactive } = req.query;
    const query = {};
    if (includeInactive !== 'true') query.active = true;

    const vehicles = await Vehicle.find(query).sort({ displayOrder: 1, createdAt: -1 });
    res.json({ success: true, count: vehicles.length, data: vehicles });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Get single vehicle
export const getVehicleById = async (req, res) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) return res.status(404).json({ success: false, message: 'Vehicle not found' });
    res.json({ success: true, data: vehicle });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Admin – create vehicle
export const createVehicle = async (req, res) => {
  try {
    const { name, description, priceInfo, displayOrder, active } = req.body;

    if (!name || !description) {
      return res.status(400).json({ success: false, message: 'Name and description are required' });
    }

    let imagePath = '';
    if (req.file) {
      imagePath = await processImage(req.file.buffer);
    }

    const vehicle = await Vehicle.create({
      name: name.trim(),
      description: description.trim(),
      priceInfo: priceInfo || 'Call for best price',
      image: imagePath,
      displayOrder: parseInt(displayOrder) || 0,
      active: active === 'false' ? false : true,
    });

    res.status(201).json({ success: true, message: 'Vehicle created', data: vehicle });
  } catch (err) {
    console.error(err);
    res.status(400).json({ success: false, message: err.message });
  }
};

// Admin – update vehicle
export const updateVehicle = async (req, res) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) return res.status(404).json({ success: false, message: 'Vehicle not found' });

    const { name, description, priceInfo, displayOrder, active } = req.body;

    if (name !== undefined) vehicle.name = name.trim();
    if (description !== undefined) vehicle.description = description.trim();
    if (priceInfo !== undefined) vehicle.priceInfo = priceInfo;
    if (displayOrder !== undefined) vehicle.displayOrder = parseInt(displayOrder) || 0;
    if (active !== undefined) vehicle.active = active === 'true' || active === true;

    if (req.file) {
      vehicle.image = await processImage(req.file.buffer, vehicle.image);
    }

    await vehicle.save();
    res.json({ success: true, message: 'Vehicle updated', data: vehicle });
  } catch (err) {
    console.error(err);
    res.status(400).json({ success: false, message: err.message });
  }
};

// Admin – delete vehicle
export const deleteVehicle = async (req, res) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id);
    if (!vehicle) return res.status(404).json({ success: false, message: 'Vehicle not found' });

    if (vehicle.image) deleteImageFile(vehicle.image);
    await Vehicle.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Vehicle deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};