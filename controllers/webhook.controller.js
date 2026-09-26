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

  // Idempotency check
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

module.exports = { handleConnectWebhook };