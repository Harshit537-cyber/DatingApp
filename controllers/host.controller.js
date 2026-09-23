const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cloudinary = require('../config/cloudinary');
const User = require('../models/user.model');
const HostApplication = require('../models/host_application.model');

const HOST_APPLICATION_FEE_CENTS = 2500; // $25

// B7: Create Application Fee Payment Intent
const createApplicationFeeIntent = async (req, res) => {
  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: HOST_APPLICATION_FEE_CENTS,
      currency: 'usd',
      metadata: {
        purpose: 'host_application_fee',
        userId: req.user._id.toString(),
      },
    });

    return res.status(200).json({
      success: true,
      data: {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// B1 & B7: Apply to become host (with ID upload & Fee check)
const applyToHost = async (req, res) => {
  try {
    const userId = req.user._id;
    const { eventConcept, govIdNote, paymentIntentId } = req.body;

    if (!eventConcept || !eventConcept.trim()) {
      return res.status(400).json({ success: false, message: 'Event concept is required.' });
    }

    // B7: Verify application fee payment
    if (!paymentIntentId) {
      return res.status(400).json({ success: false, message: 'Application fee paymentIntentId is required.' });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (
      paymentIntent.status !== 'succeeded' ||
      paymentIntent.metadata.userId !== userId.toString() ||
      paymentIntent.metadata.purpose !== 'host_application_fee'
    ) {
      return res.status(400).json({ success: false, message: 'Application fee has not been successfully completed.' });
    }

    // B1: Handle Gov ID file upload to Cloudinary
    let govIdImageUrl = '';
    if (req.file) {
      const b64 = Buffer.from(req.file.buffer).toString('base64');
      const dataURI = `data:${req.file.mimetype};base64,${b64}`;
      const result = await cloudinary.uploader.upload(dataURI, { folder: 'host_id_docs' });
      govIdImageUrl = result.secure_url;
    }

    if (!govIdImageUrl) {
      return res.status(400).json({ success: false, message: 'Gov ID document image is required.' });
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
      existing.govIdImage = govIdImageUrl;
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
        govIdImage: govIdImageUrl,
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

// Get host status
const getHostStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      'hostStatus isVerifiedHost hostApplicationId stripeConnectAccountId payoutsEnabled'
    );

    const application = user.hostApplicationId
      ? await HostApplication.findById(user.hostApplicationId)
      : null;

    return res.status(200).json({
      success: true,
      data: {
        hostStatus: user.hostStatus,
        isVerifiedHost: user.isVerifiedHost,
        payoutsEnabled: user.payoutsEnabled,
        application,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// B2: Host Stripe Connect Express onboarding
const createPayoutAccount = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user.isVerifiedHost) {
      return res.status(403).json({ success: false, message: 'Host verification required first.' });
    }

    let accountId = user.stripeConnectAccountId;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        email: user.email,
      });
      accountId = account.id;
      user.stripeConnectAccountId = accountId;
      await user.save();
    }

    const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:5000';
    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${appBaseUrl}/host/payout/refresh`,
      return_url: `${appBaseUrl}/host/payout/complete`,
      type: 'account_onboarding',
    });

    return res.status(200).json({ success: true, data: { url: link.url } });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// B2: Get payout status
const getPayoutStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user.stripeConnectAccountId) {
      return res.status(200).json({ success: true, data: { status: 'not_started' } });
    }

    const account = await stripe.accounts.retrieve(user.stripeConnectAccountId);
    user.payoutsEnabled = !!account.payouts_enabled;
    await user.save();

    return res.status(200).json({
      success: true,
      data: {
        status: account.payouts_enabled ? 'active' : 'pending',
        payoutsEnabled: account.payouts_enabled,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  createApplicationFeeIntent,
  applyToHost,
  getHostStatus,
  createPayoutAccount,
  getPayoutStatus,
};