import Settings from '../models/Settings.js';

export const getPublicSettings = async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) settings = await Settings.create({});
    res.json({ success: true, data: settings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getAllSettings = async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) settings = await Settings.create({});
    res.json({ success: true, data: settings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const updateSettings = async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) settings = new Settings();
    
    const allowedFields = ['address', 'phone', 'phoneSecondary', 'whatsapp', 'email', 'mapEmbedUrl'];
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) settings[field] = req.body[field];
    });
    
    await settings.save();
    res.json({ success: true, message: 'Settings updated', data: settings });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

export const getLocations = async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) settings = await Settings.create({});
    res.json({ success: true, data: settings.locations || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Add new location
export const addLocation = async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) settings = await Settings.create({});

    const { name } = req.body;
    
    if (!name || name.trim() === '') {
      return res.status(400).json({ success: false, message: 'Location name is required' });
    }

    // Generate slug
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    
    // Check if location exists
    if (settings.locations && settings.locations.some(loc => loc.slug === slug)) {
      return res.status(400).json({ success: false, message: 'Location already exists' });
    }

    // Initialize locations array if it doesn't exist
    if (!settings.locations) {
      settings.locations = [];
    }

    // If this is the first location, make it default
    const isDefault = settings.locations.length === 0;

    settings.locations.push({
      name: name.trim(),
      slug,
      isActive: true,
      isDefault
    });

    await settings.save();
    res.status(201).json({ success: true, message: 'Location added successfully', data: settings.locations });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// Update location (only name)
export const updateLocation = async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) settings = await Settings.create({});

    const locationIndex = settings.locations.findIndex(loc => loc._id.toString() === req.params.id);
    if (locationIndex === -1) {
      return res.status(404).json({ success: false, message: 'Location not found' });
    }

    const { name, isActive } = req.body;
    
    if (name) {
      settings.locations[locationIndex].name = name.trim();
      settings.locations[locationIndex].slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }
    
    if (isActive !== undefined) {
      settings.locations[locationIndex].isActive = isActive;
    }

    await settings.save();
    res.json({ success: true, message: 'Location updated successfully', data: settings.locations });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// Delete location
export const deleteLocation = async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) settings = await Settings.create({});

    if (!settings.locations || settings.locations.length === 0) {
      return res.status(404).json({ success: false, message: 'No locations found' });
    }

    const locationIndex = settings.locations.findIndex(loc => loc._id.toString() === req.params.id);
    if (locationIndex === -1) {
      return res.status(404).json({ success: false, message: 'Location not found' });
    }

    if (settings.locations.length <= 1) {
      return res.status(400).json({ success: false, message: 'Cannot delete the only location' });
    }

    settings.locations.splice(locationIndex, 1);
    
    // If deleted location was default, set first as default
    if (!settings.locations.some(loc => loc.isDefault) && settings.locations.length > 0) {
      settings.locations[0].isDefault = true;
    }

    await settings.save();
    res.json({ success: true, message: 'Location deleted successfully', data: settings.locations });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Set default location
export const setDefaultLocation = async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) settings = await Settings.create({});

    const locationIndex = settings.locations.findIndex(loc => loc._id.toString() === req.params.id);
    if (locationIndex === -1) {
      return res.status(404).json({ success: false, message: 'Location not found' });
    }

    settings.locations.forEach(loc => loc.isDefault = false);
    settings.locations[locationIndex].isDefault = true;

    await settings.save();
    res.json({ success: true, message: 'Default location set successfully', data: settings.locations });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// controllers/settingsController.js - ADD this function
export const getLocationBySlug = async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) settings = await Settings.create({});

    const location = settings.locations.find(loc => loc.slug === req.params.slug);
    if (!location) {
      return res.status(404).json({ success: false, message: 'Location not found' });
    }

    res.json({ success: true, data: location });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};