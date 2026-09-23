const cron = require('node-cron');
const User = require('../models/user.model');
const HostApplication = require('../models/host_application.model');

// Har roz raat ko 3:00 AM chalega
cron.schedule('0 3 * * *', async () => {
    try {
        const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

        const staleApplications = await HostApplication.find({
            status: 'approved',
            reviewedAt: { $lt: oneYearAgo },
        });

        for (const app of staleApplications) {
            app.status = 're_verification_required';
            await app.save();

            await User.findByIdAndUpdate(app.applicant, {
                isVerifiedHost: false,
                hostStatus: 'pending',
            });
        }

        if (staleApplications.length > 0) {
            console.log(`[Job] Flagged ${staleApplications.length} hosts for re-verification.`);
        }
    } catch (error) {
        console.error('[Job Error] Flag re-verification:', error.message);
    }
});