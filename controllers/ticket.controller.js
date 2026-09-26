const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const mongoose = require('mongoose');
const Event = require('../models/event.model');
const Ticket = require('../models/ticket.model');
const Transaction = require('../models/transaction.model');
const User = require('../models/user.model');

// POST /api/tickets/purchase (Reservation-backed, atomic inventory reservation)
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
      return res.status(404).json({ success: false, message: 'Event not found or not published.' });
    }

    const tier = event.ticketTiers.find((t) => t.name === ticketTier);
    if (!tier) {
      return res.status(400).json({ success: false, message: 'Ticket tier not available.' });
    }

    if (tier.allowedWristbands && !tier.allowedWristbands.includes(wristbandType)) {
      return res.status(400).json({ success: false, message: 'Invalid wristband for this tier.' });
    }

    // Host status check
    const host = await User.findById(event.hostedBy);
    if (!host || !host.isVerifiedHost || host.hostStatus !== 'approved') {
      return res.status(403).json({ success: false, message: 'Host is not currently verified.' });
    }
    if (!host.stripeConnectAccountId || !host.chargesEnabled) {
      return res.status(400).json({ success: false, message: 'Host payouts are not ready to accept sales yet.' });
    }

    // Check existing ticket
    const existing = await Ticket.findOne({
      attendee: userId,
      event: eventId,
      status: { $in: ['active', 'pending'] },
    });
    if (existing) {
      return res.status(400).json({ success: false, message: 'You already have an active or pending ticket.' });
    }

    // Atomically reserve inventory
    const reservedEvent = await Event.findOneAndUpdate(
      {
        _id: eventId,
        ticketTiers: {
          $elemMatch: { name: ticketTier, sold: { $lt: tier.available } },
        },
      },
      { $inc: { 'ticketTiers.$.sold': 1 } },
      { new: true }
    );

    if (!reservedEvent) {
      return res.status(409).json({ success: false, message: 'Tickets sold out.' });
    }

    // Server-side calculation (never trust client)
    const commissionRate = Number(process.env.PLATFORM_COMMISSION_RATE) || 0.15;
    const amountCents = Math.round(tier.price * 100);
    const applicationFeeCents = Math.round(amountCents * commissionRate);

    const paymentIntent = await stripe.paymentIntents.create(
      {
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
      },
      {
        idempotencyKey: `purchase_${userId}_${eventId}_${ticketTier}_${Date.now()}`,
      }
    );

    // Create pending Ticket reservation
    const ticket = await Ticket.create({
      attendee: userId,
      event: eventId,
      ticketTier,
      wristbandType,
      price: tier.price,
      status: 'pending',
      paymentIntentId: paymentIntent.id,
      currency: 'usd',
      purchaseExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
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
      ticket: ticket._id,
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
  try {
    const { paymentIntentId } = req.body;
    const userId = req.user._id;

    if (!paymentIntentId) {
      return res.status(400).json({ success: false, message: 'paymentIntentId is required.' });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({ success: false, message: 'Payment has not been completed.' });
    }

    if (paymentIntent.metadata.userId !== userId.toString()) {
      return res.status(403).json({ success: false, message: 'Unauthorized.' });
    }

    // Find the pending reserved ticket
    const ticket = await Ticket.findOne({ paymentIntentId });
    if (!ticket) {
      return res.status(404).json({ success: false, message: 'Ticket reservation not found or expired.' });
    }

    if (ticket.status === 'active') {
      return res.status(200).json({ success: true, ticket });
    }

    // Activate the reserved ticket (inventory is already reserved, don't increment again)
    ticket.status = 'active';
    await ticket.save();

    await Transaction.findOneAndUpdate(
      { paymentIntentId },
      { status: 'succeeded', ticket: ticket._id }
    );

    return res.status(200).json({ success: true, ticket });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/tickets/mine
const getMyTickets = async (req, res) => {
  try {
    const tickets = await Ticket.find({
      attendee: req.user._id,
      status: 'active',
    })
      .populate('event', 'title dateText eventDate location image hostedBy')
      .sort({ createdAt: -1 });

    return res.status(200).json({ success: true, data: tickets });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/tickets/validate (Atomic scan update & Host gated)
const validateTicket = async (req, res) => {
  try {
    const { qrPayload } = req.body;
    if (!qrPayload) {
      return res.status(400).json({ success: false, message: 'qrPayload is required.' });
    }

    const ticket = await Ticket.findOne({ qrPayload }).populate('event').populate('attendee', 'name profilePic');
    if (!ticket) {
      return res.status(404).json({ success: false, valid: false, message: 'Ticket not found.' });
    }

    // Gated to event host only
    if (String(ticket.event.hostedBy) !== String(req.user._id)) {
      return res.status(403).json({
        success: false,
        valid: false,
        message: 'Only the event host can scan tickets for this event.',
      });
    }

    // Check host is still verified
    if (!req.user.isVerifiedHost || req.user.hostStatus !== 'approved') {
      return res.status(403).json({
        success: false,
        valid: false,
        message: 'Host verification required to scan tickets.',
      });
    }

    // Atomic update to prevent double-scan race conditions
    const scannedTicket = await Ticket.findOneAndUpdate(
      { qrPayload, isScanned: false, status: 'active' },
      { isScanned: true, scannedAt: new Date() },
      { new: true }
    );

    if (!scannedTicket) {
      return res.status(400).json({
        success: false,
        valid: false,
        message: 'Ticket is either inactive or has already been scanned.',
      });
    }

    return res.status(200).json({
      success: true,
      valid: true,
      ticket: {
        attendeeName: ticket.attendee.name,
        profilePic: ticket.attendee.profilePic,
        ticketTier: ticket.ticketTier,
        wristbandType: ticket.wristbandType,
        eventTitle: ticket.event.title,
        scannedAt: scannedTicket.scannedAt,
      },
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { purchaseTicket, confirmTicketPurchase, getMyTickets, validateTicket };