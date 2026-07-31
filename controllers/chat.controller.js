const User = require('../models/user.model');
const Chat = require('../models/chat.model');
const Message = require('../models/message.model');

const sendMessage = async (req, res) => {
  try {
    const senderId = req.user._id;
    const { receiverId, message } = req.body;

    if (!receiverId || !message) {
      return res.status(400).json({ message: "receiverId and message are required" });
    }

    const sender = await User.findById(senderId);
    const receiver = await User.findById(receiverId);

    if (!receiver) {
      return res.status(404).json({ message: "Receiver not found" });
    }

    const isMatched = sender.matches.some(
      (id) => id.toString() === receiverId.toString()
    );

    if (!isMatched) {
      return res.status(403).json({ message: "You can only chat with matched users" });
    }

    let chat = await Chat.findOne({
      participants: { $all: [senderId, receiverId] }
    });

    if (!chat) {
      chat = await Chat.create({
        participants: [senderId, receiverId]
      });
    }

    const newMessage = await Message.create({
      chat: chat._id,
      sender: senderId,
      receiver: receiverId,
      message: message
    });

    chat.lastMessage = message;
    chat.lastMessageAt = new Date();
    await chat.save();

    const io = req.app.get("io");
    if (io) {
      io.to(receiverId.toString()).emit("receiveMessage", {
        chatId: chat._id,
        message: newMessage
      });
    }

    res.status(201).json({
      message: "Message sent successfully",
      chatId: chat._id,
      data: newMessage
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getMyChats = async (req, res) => {
  try {
    const userId = req.user._id;
    const chats = await Chat.find({ participants: userId })
      .populate("participants", "name email images age gender")
      .sort({ lastMessageAt: -1 });

    res.status(200).json({
      message: "Chats fetched successfully",
      data: chats
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getMessages = async (req, res) => {
  try {
    const userId = req.user._id;
    const { chatId } = req.params;
    const chat = await Chat.findById(chatId);

    if (!chat) {
      return res.status(404).json({ message: "Chat not found" });
    }

    const isUser = chat.participants.some(
      (id) => id.toString() === userId.toString()
    );

    if (!isUser) {
      return res.status(403).json({ message: "Access denied" });
    }

    const messages = await Message.find({ chat: chatId })
      .populate("sender", "name images")
      .populate("receiver", "name images")
      .sort({ createdAt: 1 });

    res.status(200).json({
      message: "Messages fetched successfully",
      data: messages
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const markRead = async (req, res) => {
  try {
    const userId = req.user._id;
    const { chatId } = req.params;

    await Message.updateMany(
      { chat: chatId, receiver: userId, isRead: false },
      { $set: { isRead: true } }
    );

    res.json({ message: "Messages marked as read" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  sendMessage,
  getMyChats,
  getMessages,
  markRead
};