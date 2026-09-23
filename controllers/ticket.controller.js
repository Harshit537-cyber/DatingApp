const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const mongoose = require('mongoose');
const Event = require('../models/event.model');
const Ticket = require('../models/ticket.model');
const Transaction = require('../models/transaction.model');

// POST /api/tickets/purchase
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

    const validTiers = ['standard', 'vip'];
    const validWristbands = ['the_one', 'open', 'good_time', 'vip_access'];

    if (!validTiers.includes(ticketTier)) {
      return res.status(400).json({ success: false, message: 'Invalid ticket tier.' });
    }

    if (!validWristbands.includes(wristbandType)) {
      return res.status(400).json({ success: false, message: 'Invalid wristband type.' });
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
        message: 'You already have a ticket for this event.',
      });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(tier.price * 100),
      currency: 'usd',
      metadata: {
        userId: userId.toString(),
        eventId: eventId.toString(),
        ticketTier,
        wristbandType,
        type: 'ticket_purchase',
      },
    });

    await Transaction.create({
      user: userId,
      type: 'ticket_purchase',
      amount: tier.price,
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

// POST /api/tickets/confirm
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

    const tierIndex = event.ticketTiers.findIndex((t) => t.name === ticketTier);
    event.ticketTiers[tierIndex].sold += 1;
    await event.save({ session });

    const tier = event.ticketTiers[tierIndex];

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
      .populate('event', 'title dateText eventDate location image')
      .sort({ createdAt: -1 });

    return res.status(200).json({ success: true, data: tickets });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/tickets/validate (used at event door: scan QR)
const validateTicket = async (req, res) => {
  try {
    const { qrPayload } = req.body;

    if (!qrPayload) {
      return res.status(400).json({ success: false, message: 'qrPayload is required.' });
    }

    const ticket = await Ticket.findOne({ qrPayload })
      .populate('attendee', 'name profilePic')
      .populate('event', 'title');

    if (!ticket) {
      return res.status(404).json({ success: false, valid: false, message: 'Ticket not found.' });
    }

    if (ticket.status !== 'active') {
      return res.status(400).json({ success: false, valid: false, message: 'Ticket is not active.' });
    }

    if (ticket.isScanned) {
      return res.status(400).json({ success: false, valid: false, message: 'Ticket already scanned.' });
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