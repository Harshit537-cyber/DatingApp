const checkSubscription = async (req, res, next) => {
  try {
    const user = req.user;

   
    const isExpired = !user.subscription?.endDate || new Date() > new Date(user.subscription.endDate);

    if (isExpired || !user.subscription?.isActive) {
      return res.status(403).json({
        success: false,
        requiresSubscription: true,
        message: "Aapka 1 month trial / subscription expire ho chuka hai. Kripya continue karne ke liye plan lein.",
      });
    }

    next(); 
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { checkSubscription };