require("dotenv").config();

const http = require("http");
const { Server } = require("socket.io");

const connectDB = require("./config/database");
const app = require("./app");
const User = require("./models/user.model");
const Chat = require("./models/chat.model");
const Message = require("./models/message.model");
const socketAuth = require("./middleware/socketAuth");

connectDB();

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  },
});

app.set("io", io);

io.use(socketAuth);

const activeUsers = new Map();

io.on("connection", async (socket) => {
  const userId = socket.user._id.toString();
  const userName = socket.user.name;

  activeUsers.set(userId, socket.id);
  socket.join(userId);

  await User.findByIdAndUpdate(userId, {
    isOnline: true,
  });

  console.log(`[Socket] User Connected Successfully: ${userName} (${userId}) - Socket ID: ${socket.id}`);

  io.emit("userStatusChanged", {
    userId,
    isOnline: true,
    lastSeen: null,
  });

  socket.on("joinChat", (chatId) => {
    socket.join(chatId);
    console.log(`[Socket] User ${userName} joined Chat Room: ${chatId}`);
  });

  socket.on("getUserStatus", async (data, callback) => {
    try {
      const { targetUserId } = data;
      console.log(`[Socket] User Status Requested for Target User: ${targetUserId}`);

      const targetUser = await User.findById(targetUserId).select(
        "isOnline lastSeen"
      );

      if (!targetUser) {
        if (callback) callback({ error: "User not found" });
        return;
      }

      if (callback) {
        callback({
          success: true,
          isOnline: targetUser.isOnline,
          lastSeen: targetUser.lastSeen,
        });
      }
    } catch (error) {
      if (callback) callback({ error: error.message });
    }
  });

  socket.on("sendMessage", async (data, callback) => {
    try {
      const { receiverId, message } = data;

      if (!receiverId || !message) {
        if (callback) callback({ error: "receiverId and message are required" });
        return;
      }

      const sender = await User.findById(userId);
      const receiver = await User.findById(receiverId);

      if (!receiver) {
        if (callback) callback({ error: "Receiver not found" });
        return;
      }

      const isMatched = sender.matches.some(
        (id) => id.toString() === receiverId.toString()
      );

      if (!isMatched) {
        if (callback) callback({ error: "You can only chat with matched users" });
        return;
      }

      let chat = await Chat.findOne({
        participants: { $all: [userId, receiverId] },
      });

      if (!chat) {
        chat = await Chat.create({
          participants: [userId, receiverId],
        });
      }

      const newMessage = await Message.create({
        chat: chat._id,
        sender: userId,
        receiver: receiverId,
        message: message,
      });

      chat.lastMessage = message;
      chat.lastMessageAt = new Date();
      await chat.save();

      console.log(`[Socket] Message Sent Successfully from ${userName} (${userId}) to Receiver (${receiverId}) in Chat: ${chat._id}`);

      io.to(chat._id.toString()).emit("receiveMessage", newMessage);
      io.to(receiverId.toString()).emit("newMessageNotification", {
        chatId: chat._id,
        senderId: userId,
        message,
      });

      if (callback) callback({ success: true, data: newMessage });
    } catch (error) {
      if (callback) callback({ error: error.message });
    }
  });

  socket.on("getChats", async (callback) => {
    try {
      const chats = await Chat.find({ participants: userId })
        .populate("participants", "name email profilePic age gender isOnline lastSeen")
        .sort({ lastMessageAt: -1 });

      console.log(`[Socket] Inbox Chats Fetched Successfully for User: ${userName} (${userId}) - Count: ${chats.length}`);

      if (callback) callback({ success: true, chats });
    } catch (error) {
      if (callback) callback({ error: error.message });
    }
  });

  socket.on("getNewMatches", async (callback) => {
    try {
      const user = await User.findById(userId).populate({
        path: "matches",
        select: "name profilePic age gender bio livingIn isOnline lastSeen",
      });

      const existingChats = await Chat.find({ participants: userId });
      const chattedUserIds = existingChats.flatMap((chat) =>
        chat.participants.map((p) => p.toString())
      );

      const unchattedMatches = user.matches.filter(
        (match) => !chattedUserIds.includes(match._id.toString())
      );

      console.log(`[Socket] New Matches Fetched Successfully for User: ${userName} (${userId}) - Count: ${unchattedMatches.length}`);

      if (callback) callback({ success: true, matches: unchattedMatches });
    } catch (error) {
      if (callback) callback({ error: error.message });
    }
  });

  socket.on("getMessages", async (data, callback) => {
    try {
      const { chatId } = data;
      const chat = await Chat.findById(chatId);

      if (!chat) {
        if (callback) callback({ error: "Chat not found" });
        return;
      }

      const isParticipant = chat.participants.some(
        (id) => id.toString() === userId
      );

      if (!isParticipant) {
        if (callback) callback({ error: "Access denied" });
        return;
      }

      const messages = await Message.find({ chat: chatId })
        .populate("sender", "name profilePic")
        .populate("receiver", "name profilePic")
        .sort({ createdAt: 1 });

      console.log(`[Socket] Message History Fetched Successfully for Chat: ${chatId} - Count: ${messages.length}`);

      if (callback) callback({ success: true, messages });
    } catch (error) {
      if (callback) callback({ error: error.message });
    }
  });

  socket.on("markRead", async (data, callback) => {
    try {
      const { chatId } = data;

      await Message.updateMany(
        { chat: chatId, receiver: userId, isRead: false },
        { $set: { isRead: true } }
      );

      console.log(`[Socket] Messages Marked as Read for Chat: ${chatId} by User: ${userName} (${userId})`);

      socket.to(chatId).emit("messagesRead", { chatId, readBy: userId });

      if (callback) callback({ success: true });
    } catch (error) {
      if (callback) callback({ error: error.message });
    }
  });

  socket.on("disconnect", async () => {
    activeUsers.delete(userId);
    const lastSeenTime = new Date();

    await User.findByIdAndUpdate(userId, {
      isOnline: false,
      lastSeen: lastSeenTime,
    });

    console.log(`[Socket] User Disconnected: ${userName} (${userId}) - Socket ID: ${socket.id}`);

    io.emit("userStatusChanged", {
      userId,
      isOnline: false,
      lastSeen: lastSeenTime,
    });
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});