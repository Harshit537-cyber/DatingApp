const Event = require('../models/event.model');
const cloudinary = require('../config/cloudinary');

// POST /api/host/events
const createHostEvent = async (req, res) => {
  try {
    const hostId = req.user._id;
    const {
      title,
      dateText,
      eventDate,
      location,
      description,
      dressCode,
      capacity,
      standardPrice,
      vipPrice,
      standardAvailable,
      vipAvailable,
    } = req.body;

    let imageUrl = '';
    if (req.file) {
      const b64 = Buffer.from(req.file.buffer).toString('base64');
      const dataURI = `data:${req.file.mimetype};base64,${b64}`;
      const result = await cloudinary.uploader.upload(dataURI, {
        folder: 'host_events',
      });
      imageUrl = result.secure_url;
    }

    if (!imageUrl) {
      return res.status(400).json({ success: false, message: 'Event image is required.' });
    }

    const event = await Event.create({
      title,
      dateText,
      eventDate: new Date(eventDate),
      location: location || '',
      description: description || '',
      dressCode: dressCode || '',
      capacity: Number(capacity) || 200,
      image: imageUrl,
      isExclusive: true,
      hostedBy: hostId,
      status: 'published',
      ticketTiers: [
        {
          name: 'standard',
          price: Number(standardPrice) || 49.99,
          available: Number(standardAvailable) || 100,
          sold: 0,
        },
        {
          name: 'vip',
          price: Number(vipPrice) || 99.99,
          available: Number(vipAvailable) || 50,
          sold: 0,
        },
      ],
    });

    return res.status(201).json({ success: true, data: event });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};  
const getHostEvents = async (req, res) => {
  try {
    const events = await Event.find({ hostedBy: req.user._id }).sort({ eventDate: 1 });
    return res.status(200).json({ success: true, data: events });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
module.exports = { createHostEvent, getHostEvents };