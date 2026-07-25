const express = require('express');
const userRoutes = require('./routes/user.routes');
const errorHandler = require('./middleware/error.middleware');

const app = express();

app.use(express.json());

app.use('/api/v1/users', userRoutes);

app.use((req, res, next) => {
  const error = new Error('Route not found');
  error.statusCode = 404;
  next(error);
});

app.use(errorHandler);

module.exports = app;