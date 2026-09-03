const checkSubscription = async (req, res, next) => {
  try {
    const user = req.user;

    
    const isExpired =
      !user.subscription?.endDate ||
      new Date() > new Date(user.subscription.endDate);

    if (isExpired || !user.subscription?.isActive) {
      return res.status(403).json({
        success: false,
        requiresSubscription: true,
        message: "Your trial or subscription has expired. Please subscribe to a plan to continue.",
      });
    }

    next(); 
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { checkSubscription };