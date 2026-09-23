const cron = require('node-cron');
const Ticket = require('../models/ticket.model');

// Har 5 minute me chalega
cron.schedule('*/5 * * * *', async () => {
  try {
    const result = await Ticket.deleteMany({
      status: 'pending',
      purchaseExpiresAt: { $lt: new Date() },
    });

    if (result.deletedCount > 0) {
      console.log(`[Job] Cleaned up ${result.deletedCount} expired pending tickets.`);
    }
  } catch (error) {
    console.error('[Job Error] Expire pending tickets:', error.message);
  }
});