const Swipe = require('../models/swipe.model');
const User = require('../models/user.model');

const superLikeUser = async (req, res) => {
    try {
        const userId = req.user.id;
        const { targetUserId } = req.body;

        if (userId.toString() === targetUserId) {
            return res.status(400).json({
                success: false,
                message: "You cannot super like yourself"
            });
        }

        const currentUser = await User.findById(userId).populate('subscription.plan');

        if (!currentUser) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        const isSubscribed = currentUser.subscription && 
                            currentUser.subscription.isActive && 
                            new Date(currentUser.subscription.endDate) > new Date();

        if (!isSubscribed) {
            return res.status(403).json({
                success: false,
                message: "Super Likes are only available for subscribed users. Please upgrade your plan."
            });
        }

        const planName = currentUser.subscription.plan ? currentUser.subscription.plan.name : '';

        let dailyLimit = 0;
        if (planName === 'Silver') {
            dailyLimit = 5;
        } else if (planName === 'Gold') {
            dailyLimit = 10;
        } else if (planName === 'Platinum') {
            dailyLimit = Infinity;
        }

        if (dailyLimit !== Infinity) {
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);

            const superLikesToday = await Swipe.countDocuments({
                fromUser: userId,
                action: "superlike",
                createdAt: { $gte: startOfDay }
            });

            if (superLikesToday >= dailyLimit) {
                return res.status(400).json({
                    success: false,
                    message: `Daily Super Like limit reached for your ${planName} plan (${dailyLimit}/day)`
                });
            }
        }

        const targetUser = await User.findById(targetUserId);

        if (!targetUser) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        const alreadyLiked = await Swipe.findOne({
            fromUser: userId,
            toUser: targetUserId
        });

        if (alreadyLiked) {
            return res.status(400).json({
                success: false,
                message: "Already swiped this user"
            });
        }

        const swipe = await Swipe.create({
            fromUser: userId,
            toUser: targetUserId,
            action: "superlike"
        });

        res.status(201).json({
            success: true,
            message: "Super Like sent successfully",
            swipe
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

module.exports = {
    superLikeUser
};