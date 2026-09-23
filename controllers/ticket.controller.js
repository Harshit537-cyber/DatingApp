const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const mongoose = require('mongoose');
const Event = require('../models/event.model');
const Ticket = require('../models/ticket.model');
const Transaction = require('../models/transaction.model');
const User = require('../models/user.model');

const PLATFORM_COMMISSION_RATE = 0.15; // 15% platform fee

// POST /api/tickets/purchase (B3 & B10)
const purchaseTicket = async (req, res) => {
  try {
    const { eventId, ticketTier, wristbandType } = req.body;
    const userId = req.user._id;

    if (!eventId || !ticketTier || !wristbandType) {
      return res.status(400).json({
        success: false,
        message: 'eventId, ticketTier, and wristbandType are required.',
      });
    }

    const event = await Event.findById(eventId);
    if (!event || event.status !== 'published') {
      return res.status(404).json({
        success: false,
        message: 'Event not found or not published.',
      });
    }

    const tier = event.ticketTiers.find((t) => t.name === ticketTier);
    if (!tier) {
      return res.status(400).json({ success: false, message: 'Ticket tier not available.' });
    }

    // B10: Wristband - Tier Mapping Validation
    if (tier.allowedWristbands && !tier.allowedWristbands.includes(wristbandType)) {
      return res.status(400).json({
        success: false,
        message: 'This wristband is not available for the selected ticket tier.',
      });
    }

    if (tier.sold >= tier.available) {
      return res.status(400).json({ success: false, message: 'Tickets sold out.' });
    }

    const existing = await Ticket.findOne({
      attendee: userId,
      event: eventId,
      status: { $in: ['active', 'pending'] },
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'You already have an active or pending ticket for this event.',
      });
    }

    // B3: Stripe Connect check for Host
    const host = await User.findById(event.hostedBy);
    if (!host || !host.stripeConnectAccountId || !host.payoutsEnabled) {
      return res.status(400).json({
        success: false,
        message: 'Host payouts are not set up for this event yet.',
      });
    }

    const amountCents = Math.round(tier.price * 100);
    const applicationFeeCents = Math.round(amountCents * PLATFORM_COMMISSION_RATE);

    // Destination charge: Split at source
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      application_fee_amount: applicationFeeCents,
      transfer_data: { destination: host.stripeConnectAccountId },
      metadata: {
        eventId: eventId.toString(),
        ticketTier,
        wristbandType,
        userId: userId.toString(),
        type: 'ticket_purchase',
      },
    });

    await Transaction.create({
      user: userId,
      type: 'ticket_purchase',
      amount: tier.price,
      platformFee: applicationFeeCents / 100,
      currency: 'usd',
      status: 'pending',
      paymentIntentId: paymentIntent.id,
      paymentMethod: 'stripe',
      event: eventId,
    });

    return res.status(200).json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      price: tier.price,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/tickets/confirm (B5: Atomic Oversell Prevention)
const confirmTicketPurchase = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { paymentIntentId } = req.body;
    const userId = req.user._id;

    if (!paymentIntentId) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'paymentIntentId is required.' });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Payment has not been completed.',
      });
    }

    if (paymentIntent.metadata.userId !== userId.toString()) {
      await session.abortTransaction();
      return res.status(403).json({ success: false, message: 'Unauthorized.' });
    }

    const existingTicket = await Ticket.findOne({ paymentIntentId }).session(session);
    if (existingTicket && existingTicket.status === 'active') {
      await session.abortTransaction();
      return res.status(200).json({ success: true, ticket: existingTicket });
    }

    const { eventId, ticketTier, wristbandType } = paymentIntent.metadata;

    const event = await Event.findById(eventId).session(session);
    if (!event) {
      await session.abortTransaction();
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }

    const tier = event.ticketTiers.find((t) => t.name === ticketTier);
    if (!tier) {
      await session.abortTransaction();
      return res.status(400).json({ success: false, message: 'Tier not found.' });
    }

    // B5: Atomic conditional increment to prevent overselling
    const updatedEvent = await Event.findOneAndUpdate(
      {
        _id: eventId,
        ticketTiers: {
          $elemMatch: {
            name: ticketTier,
            sold: { $lt: tier.available },
          },
        },
      },
      {
        $inc: { 'ticketTiers.$.sold': 1 },
      },
      { new: true, session }
    );

    if (!updatedEvent) {
      await session.abortTransaction();
      // Auto-refund payment if oversold
      try {
        await stripe.refunds.create({ payment_intent: paymentIntentId });
      } catch (refundErr) {
        console.error('Auto-refund failed:', refundErr.message);
      }
      return res.status(409).json({
        success: false,
        message: 'Tickets sold out — payment has been refunded.',
      });
    }

    const [ticket] = await Ticket.create(
      [
        {
          attendee: userId,
          event: eventId,
          ticketTier,
          wristbandType,
          price: tier.price,
          status: 'active',
          paymentIntentId,
          currency: 'usd',
        },
      ],
      { session }
    );

    await Transaction.findOneAndUpdate(
      { paymentIntentId },
      { status: 'succeeded', ticket: ticket._id },
      { session }
    );

    await session.commitTransaction();
    return res.status(201).json({ success: true, ticket });
  } catch (error) {
    await session.abortTransaction();
    return res.status(500).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
};

// GET /api/tickets/mine
const getMyTickets = async (req, res) => {
  try {
    const tickets = await Ticket.find({
      attendee: req.user._id,
      status: { $ne: 'cancelled' },
    })
      .populate('event', 'title dateText eventDate location image hostedBy')
      .sort({ createdAt: -1 });

    return res.status(200).json({ success: true, data: tickets });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/tickets/validate (B4: Door Scan Restricted to Host)
const validateTicket = async (req, res) => {
  try {
    const { qrPayload } = req.body;

    if (!qrPayload) {
      return res.status(400).json({ success: false, message: 'qrPayload is required.' });
    }

    const ticket = await Ticket.findOne({ qrPayload })
      .populate('attendee', 'name profilePic')
      .populate('event', 'title hostedBy');

    if (!ticket) {
      return res.status(404).json({ success: false, valid: false, message: 'Ticket not found.' });
    }

    // B4: Security fix — only the actual host can validate
    if (String(ticket.event.hostedBy) !== String(req.user._id)) {
      return res.status(403).json({
        success: false,
        valid: false,
        message: 'Only the event host can scan tickets for this event.',
      });
    }

    if (ticket.status !== 'active') {
      return res.status(400).json({ success: false, valid: false, message: 'Ticket is not active.' });
    }

    if (ticket.isScanned) {
      return res.status(400).json({
        success: false,
        valid: false,
        message: 'Ticket already scanned.',
      });
    }

    ticket.isScanned = true;
    ticket.scannedAt = new Date();
    await ticket.save();

    return res.status(200).json({
      success: true,
      valid: true,
      ticket: {
        attendeeName: ticket.attendee.name,
        profilePic: ticket.attendee.profilePic,
        ticketTier: ticket.ticketTier,
        wristbandType: ticket.wristbandType,
        eventTitle: ticket.event.title,
        scannedAt: ticket.scannedAt,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { purchaseTicket, confirmTicketPurchase, getMyTickets, validateTicket };