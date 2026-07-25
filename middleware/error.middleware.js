const errorHandler = (err, req, res, next) => {
  let { statusCode = 500, message } = err;
  
  if (process.env.NODE_ENV === 'production' && !err.isOperational) {
    statusCode = 500;
    message = 'Internal Server Error';
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code: statusCode,
      message: message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    },
  });
};

module.exports = errorHandler;