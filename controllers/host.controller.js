const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cloudinary = require('../config/cloudinary');
const User = require('../models/user.model');
const HostApplication = require('../models/host_application.model');

// B7: Create Host Application Fee Payment Intent ($25)
const createApplicationFeeIntent = async (req, res) => {
  try {
    const feeCents = Number(process.env.HOST_APPLICATION_FEE_CENTS) || 2500;
    const paymentIntent = await stripe.paymentIntents.create({
      amount: feeCents,
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

// B1 & B7: Apply to Host (Private ID upload + Durable Fee Verification)
const applyToHost = async (req, res) => {
  try {
    const userId = req.user._id;
    const { eventConcept, govIdNote, paymentIntentId } = req.body;

    if (!eventConcept || !eventConcept.trim()) {
      return res.status(400).json({ success: false, message: 'Event concept is required.' });
    }

    if (!paymentIntentId) {
      return res.status(400).json({ success: false, message: 'Application fee paymentIntentId is required.' });
    }

    const feeCents = Number(process.env.HOST_APPLICATION_FEE_CENTS) || 2500;
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (
      paymentIntent.status !== 'succeeded' ||
      paymentIntent.amount !== feeCents ||
      paymentIntent.currency !== 'usd' ||
      paymentIntent.metadata.userId !== userId.toString() ||
      paymentIntent.metadata.purpose !== 'host_application_fee'
    ) {
      return res.status(400).json({ success: false, message: 'Invalid or incomplete application fee payment.' });
    }

    // Check if this PaymentIntent was already consumed
    const alreadyUsed = await HostApplication.findOne({ applicationFeePaymentIntentId: paymentIntentId });
    if (alreadyUsed) {
      return res.status(400).json({ success: false, message: 'This application fee has already been used.' });
    }

    // Private ID Upload to Cloudinary
    let govIdImageUrl = '';
    if (req.file) {
      const b64 = Buffer.from(req.file.buffer).toString('base64');
      const dataURI = `data:${req.file.mimetype};base64,${b64}`;
      const result = await cloudinary.uploader.upload(dataURI, {
        folder: 'host_id_docs',
        type: 'authenticated', // Secure access
      });
      govIdImageUrl = result.secure_url;
    }

    if (!govIdImageUrl) {
      return res.status(400).json({ success: false, message: 'Government ID image is required.' });
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
      existing.applicationFeePaymentIntentId = paymentIntentId;
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
        applicationFeePaymentIntentId: paymentIntentId,
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

const getHostStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      'hostStatus isVerifiedHost hostApplicationId stripeConnectAccountId payoutsEnabled chargesEnabled stripeAccountStatus'
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
        chargesEnabled: user.chargesEnabled,
        stripeAccountStatus: user.stripeAccountStatus,
        application,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// B2 & v3: Idempotent Stripe Connect Express Onboarding
const createPayoutAccount = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user.isVerifiedHost || user.hostStatus !== 'approved') {
      return res.status(403).json({ success: false, message: 'Verified host status required.' });
    }

    let accountId = user.stripeConnectAccountId;
    if (!accountId) {
      const locked = await User.findOneAndUpdate(
        { _id: user._id, stripeConnectAccountId: null },
        { stripeAccountStatus: 'onboarding_pending' },
        { new: true }
      );

      if (!locked) {
        return res.status(409).json({ success: false, message: 'Onboarding already in progress.' });
      }

      const account = await stripe.accounts.create({ type: 'express', email: user.email });
      accountId = account.id;
      locked.stripeConnectAccountId = accountId;
      await locked.save();
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

// Live Payout Status
const getPayoutStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user.stripeConnectAccountId) {
      return res.status(200).json({
        success: true,
        data: { status: 'not_started', payoutsEnabled: false, chargesEnabled: false },
      });
    }

    const account = await stripe.accounts.retrieve(user.stripeConnectAccountId);
    user.payoutsEnabled = !!account.payouts_enabled;
    user.chargesEnabled = !!account.charges_enabled;
    user.detailsSubmitted = !!account.details_submitted;
    user.stripeRequirementsDue = account.requirements?.currently_due || [];
    user.stripeAccountStatus = account.charges_enabled
      ? 'active'
      : account.details_submitted
      ? 'restricted'
      : 'onboarding_pending';
    user.stripeStateUpdatedAt = new Date();
    await user.save();

    return res.status(200).json({
      success: true,
      data: {
        status: user.stripeAccountStatus,
        payoutsEnabled: account.payouts_enabled,
        chargesEnabled: account.charges_enabled,
        detailsSubmitted: account.details_submitted,
        requirementsDue: user.stripeRequirementsDue,
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