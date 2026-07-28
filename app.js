const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const reportRoutes = require('./routes/report.routes');
const app = express();
const swipeRoutes = require('./routes/swipe.routes');
const chatRoutes = require(
  './routes/chat.routes'
);
app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/swipes', swipeRoutes);
app.use('/api/chat', chatRoutes);
module.exports = app;