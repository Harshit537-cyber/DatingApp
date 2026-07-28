require('dotenv').config();

const http = require('http');
const { Server } = require('socket.io');

const connectDB = require('./config/database');
const app = require('./app');

// Connect Database
connectDB();

const PORT = process.env.PORT || 5000;

// Create HTTP server using Express app
const server = http.createServer(app);

// Setup Socket.IO
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
  }
});
app.set('io', io);
// Socket connection
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // User joins their personal room
  socket.on('joinUser', (userId) => {
    socket.join(userId);

    console.log(`User joined room: ${userId}`);
  });

  // User joins a chat room
  socket.on('joinChat', (chatId) => {
    socket.join(chatId);

    console.log(`User joined chat room: ${chatId}`);
  });

  // Receive message and send it in real time
  socket.on('sendMessage', (data) => {
    const {
      chatId,
      senderId,
      receiverId,
      message
    } = data;

    // Send message to users connected to this chat room
    io.to(chatId).emit('receiveMessage', {
      chatId,
      senderId,
      receiverId,
      message,
      createdAt: new Date()
    });
  });

  // User disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});