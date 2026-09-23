const User = require('../models/user.model');
const HostApplication = require('../models/host_application.model');

// POST /api/host/apply
const applyToHost = async (req, res) => {
  try {
    const userId = req.user._id;
    const { eventConcept, govIdNote } = req.body;

    if (!eventConcept || !eventConcept.trim()) {
      return res.status(400).json({ success: false, message: 'Event concept is required.' });
    }

    const existing = await HostApplication.findOne({ applicant: userId });

    if (existing && existing.status === 'pending_review') {
      return res.status(400).json({
        success: false,
        message: 'You already have a pending application.',
        application: existing,
      });
    }

    let application;
    if (existing) {
      existing.eventConcept = eventConcept.trim();
      existing.govIdNote = govIdNote || '';
      existing.status = 'pending_review';
      existing.adminNote = '';
      existing.reviewedAt = null;
      existing.reviewedBy = null;
      application = await existing.save();
    } else {
      application = await HostApplication.create({
        applicant: userId,
        eventConcept: eventConcept.trim(),
        govIdNote: govIdNote || '',
      });
    }

    await User.findByIdAndUpdate(userId, {
      hostStatus: 'pending',
      hostApplicationId: application._id,
    });

    return res.status(201).json({ success: true, data: application });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/host/status
const getHostStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      'hostStatus isVerifiedHost hostApplicationId'
    );

    const application = user.hostApplicationId
      ? await HostApplication.findById(user.hostApplicationId)
      : null;

    return res.status(200).json({
      success: true,
      data: {
        hostStatus: user.hostStatus,
        isVerifiedHost: user.isVerifiedHost,
        application,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { applyToHost, getHostStatus };