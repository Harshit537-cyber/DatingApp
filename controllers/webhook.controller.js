const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const ProcessedEvent = require('../models/processed_event.model');
const User = require('../models/user.model');

const handleConnectWebhook = async (req, res) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers['stripe-signature'],
      process.env.STRIPE_CONNECT_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook signature verification failed: ${err.message}`);
  }

  const alreadyProcessed = await ProcessedEvent.findOne({ stripeEventId: event.id });
  if (alreadyProcessed) {
    return res.status(200).json({ received: true });
  }

  if (event.type === 'account.updated') {
    const account = event.data.object;
    const user = await User.findOne({ stripeConnectAccountId: account.id });
    if (user) {
      user.chargesEnabled = !!account.charges_enabled;
      user.payoutsEnabled = !!account.payouts_enabled;
      user.detailsSubmitted = !!account.details_submitted;
      user.stripeRequirementsDue = account.requirements?.currently_due || [];
      user.stripeAccountStatus = account.charges_enabled
        ? 'active'
        : account.details_submitted
        ? 'restricted'
        : 'onboarding_pending';
      user.stripeStateUpdatedAt = new Date();
      await user.save();
    }
  }

  await ProcessedEvent.create({ stripeEventId: event.id, type: event.type });
  return res.status(200).json({ received: true });
};

const createConnectAccount = async (req, res) => {
  try {
    const { userId } = req.body;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.stripeConnectAccountId) {
      return res.status(400).json({ error: 'Stripe account already exists for this user' });
    }

    const account = await stripe.accounts.create({
      type: 'express',
      email: user.email,
    });

    user.stripeConnectAccountId = account.id;
    user.stripeAccountStatus = 'onboarding_pending';
    await user.save();

    return res.status(201).json({ accountId: account.id });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

const generateAccountLink = async (req, res) => {
  try {
    const { userId } = req.body;
    const user = await User.findById(userId);

    if (!user || !user.stripeConnectAccountId) {
      return res.status(400).json({ error: 'Invalid user or missing Stripe Connect account' });
    }

    const accountLink = await stripe.accountLinks.create({
      account: user.stripeConnectAccountId,
      refresh_url: `${process.env.CLIENT_URL}/onboarding/refresh`,
      return_url: `${process.env.CLIENT_URL}/onboarding/success`,
      type: 'account_onboarding',
    });

    return res.status(200).json({ url: accountLink.url });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};


const createDashboardLoginLink = async (req, res) => {
  try {
    const { userId } = req.body;
    const user = await User.findById(userId);

    if (!user || !user.stripeConnectAccountId) {
      return res.status(400).json({ error: 'User does not have a connected Stripe account' });
    }

    const loginLink = await stripe.accounts.createLoginLink(
      user.stripeConnectAccountId
    );

    return res.status(200).json({ url: loginLink.url });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

module.exports = { 
  handleConnectWebhook,
  createConnectAccount,
  generateAccountLink,
  createDashboardLoginLink
};