import Contact from '../models/Contact.js';
import { sendContactEmail, sendConfirmationEmail } from '../services/emailService.js';

// @desc    Create new contact message
// @route   POST /api/contacts
// @access  Public
export const createContact = async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;

    // Validation
    if (!subject || !message) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: ['Subject is required', 'Message is required']
      });
    }

    // Create contact
    const contact = await Contact.create({
      name: name || 'Anonymous',
      email: email || 'No email provided',
      phone: phone || 'No phone provided',
      subject,
      message
    });

    // Send email notifications (optional - don't block response if email fails)
    try {
      // Send email to admin
      await sendContactEmail(contact);
      
      // Send confirmation email to user if they provided an email
      if (email && email !== 'No email provided') {
        await sendConfirmationEmail(contact);
      }
      
      console.log('Both emails sent successfully');
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      // Don't fail the request if email fails
    }

    res.status(201).json({
      success: true,
      message: 'Contact message sent successfully',
      data: contact
    });
  } catch (error) {
    console.error('Create contact error:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error creating contact message',
      error: error.message
    });
  }
};

// @desc    Get all contact messages (with pagination)
// @route   GET /api/contacts
// @access  Public (in real app, this should be protected)
export const getContacts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const contacts = await Contact.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Contact.countDocuments();

    res.status(200).json({
      success: true,
      data: contacts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get contacts error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching contact messages',
      error: error.message
    });
  }
};

// @desc    Get single contact message
// @route   GET /api/contacts/:id
// @access  Public (in real app, this should be protected)
export const getContact = async (req, res) => {
  try {
    const contact = await Contact.findById(req.params.id);

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact message not found'
      });
    }

    res.status(200).json({
      success: true,
      data: contact
    });
  } catch (error) {
    console.error('Get contact error:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid contact ID'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error fetching contact message',
      error: error.message
    });
  }
};

// @desc    Update contact status
// @route   PUT /api/contacts/:id
// @access  Public (in real app, this should be protected)
export const updateContact = async (req, res) => {
  try {
    const { status } = req.body;

    const contact = await Contact.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    );

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact message not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Contact updated successfully',
      data: contact
    });
  } catch (error) {
    console.error('Update contact error:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error updating contact message',
      error: error.message
    });
  }
};

// @desc    Delete contact message
// @route   DELETE /api/contacts/:id
// @access  Public (in real app, this should be protected)
export const deleteContact = async (req, res) => {
  try {
    const contact = await Contact.findByIdAndDelete(req.params.id);

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact message not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Contact message deleted successfully'
    });
  } catch (error) {
    console.error('Delete contact error:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid contact ID'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error deleting contact message',
      error: error.message
    });
  }
};