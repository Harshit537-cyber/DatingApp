const requireVerifiedHost = (req, res, next) => {
  if (!req.user || !req.user.isVerifiedHost) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Host verification required.',
    });
  }
  return next();
};

module.exports = { requireVerifiedHost };