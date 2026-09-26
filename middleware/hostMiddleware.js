const requireVerifiedHost = (req, res, next) => {
  if (
    !req.user ||
    !req.user.isVerifiedHost ||
    req.user.hostStatus !== "approved"
  ) {
    return res.status(403).json({
      success: false,
      message: "Access denied. Active and approved host verification required.",
    });
  }
  return next();
};

module.exports = { requireVerifiedHost };