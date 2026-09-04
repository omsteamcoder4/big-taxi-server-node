// models/Settings.js - ADD locations array
import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema({
  // Keep existing fields
  address: { type: String, default: '318/A, Kathayammal Nagar, Maniyanoor, Kondalambatti (South), Salem-636010' },
  phone: { type: String, default: '8248329031' },
  phoneSecondary: { type: String, default: '8270583705' },
  whatsapp: { type: String, default: '919944665375' },
  email: { type: String, default: 'info@jaitaxisalem.com' },
  mapEmbedUrl: { type: String, default: 'https://www.google.com/maps/embed?pb=...' },
  
  // ADD THIS - Simple locations array
  locations: [{
    name: { type: String, required: true },
    slug: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    isDefault: { type: Boolean, default: false }
  }]
}, { timestamps: true });

export default mongoose.model('Settings', settingsSchema);