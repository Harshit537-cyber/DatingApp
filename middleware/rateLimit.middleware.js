
const { rateLimit } = require("express-rate-limit");

// Shared configuration for password-reset endpoints
const createRateLimiter = (windowMs, limit, message) => {
  return rateLimit({
    windowMs,
    limit,

    standardHeaders: true,
    legacyHeaders: false,

    handler: (req, res) => {
      return res.status(429).json({
        success: false,
        message,
      });
    },
  });
};

// Maximum 5 OTP requests per IP in 15 minutes
const forgotPasswordLimiter = createRateLimiter(
  15 * 60 * 1000,
  5,
  "Too many password-reset requests. Please try again later."
);

// Maximum 10 OTP verification requests per IP in 15 minutes
const verifyResetOtpLimiter = createRateLimiter(
  15 * 60 * 1000,
  10,
  "Too many OTP verification attempts. Please try again later."
);

// Maximum 5 password-reset submissions per IP in 15 minutes
const resetPasswordLimiter = createRateLimiter(
  15 * 60 * 1000,
  5,
  "Too many password-reset attempts. Please try again later."
);

module.exports = {
  forgotPasswordLimiter,
  verifyResetOtpLimiter,
  resetPasswordLimiter,
};
