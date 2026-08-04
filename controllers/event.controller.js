const Event = require("../models/event.model");
const cloudinary = require("../config/cloudinary");

const createEvent = async (req, res) => {
  try {
    const { title, dateText, eventDate, location, isExclusive } = req.body;

    let imageUrl = "";

    if (req.file) {
      const b64 = Buffer.from(req.file.buffer).toString("base64");
      const dataURI = "data:" + req.file.mimetype + ";base64," + b64;
      const result = await cloudinary.uploader.upload(dataURI, {
        folder: "events",
      });
      imageUrl = result.secure_url;
    }

    if (!imageUrl) {
      return res.status(400).json({ message: "Event image is required" });
    }

    const event = await Event.create({
      title,
      dateText,
      eventDate: new Date(eventDate),
      location: location || "",
      image: imageUrl,
      isExclusive: isExclusive !== undefined ? String(isExclusive) === "true" : true,
    });

    return res.status(201).json({
      success: true,
      data: event,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const getEvents = async (req, res) => {
  try {
    const events = await Event.find().sort({ eventDate: 1 });
    return res.status(200).json({ success: true, data: events });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createEvent,
  getEvents,
};