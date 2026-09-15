const Chat = require("../models/chat.model");
const Message = require("../models/message.model");
const User = require("../models/user.model");

exports.getInbox = async (req, res) => {
  try {
    const userId = req.user._id;

    const chats = await Chat.find({ participants: userId })
      .populate("participants", "name profilePic isOnline lastSeen")
      .sort({ updatedAt: -1 });

    return res.status(200).json({ success: true, chats });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getChatHistory = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user._id;

    const chat = await Chat.findById(chatId);
    if (!chat || !chat.participants.includes(userId)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const messages = await Message.find({ chat: chatId })
      .populate("sender", "name profilePic")
      .populate("receiver", "name profilePic")
      .sort({ createdAt: 1 });

    return res.status(200).json({ success: true, messages });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getNewMatches = async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId).populate({
      path: "matches",
      select: "name profilePic age gender isOnline lastSeen",
    });

    const existingChats = await Chat.find({ participants: userId });
    const chattedIds = existingChats.flatMap((c) =>
      c.participants.map((p) => p.toString())
    );

    const matches = user.matches.filter(
      (m) => !chattedIds.includes(m._id.toString())
    );

    return res.status(200).json({ success: true, matches });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.accessChat = async (req, res) => {
  try {
    const { recipientId } = req.params;
    const userId = req.user._id;

    if (recipientId === userId.toString()) {
      return res.status(400).json({ success: false, message: "Cannot chat with yourself" });
    }

    let chat = await Chat.findOne({
      participants: { $all: [userId, recipientId], $size: 2 },
    }).populate("participants", "name profilePic isOnline lastSeen");

    if (!chat) {
      chat = await Chat.create({
        participants: [userId, recipientId],
      });
      chat = await Chat.findById(chat._id).populate(
        "participants",
        "name profilePic isOnline lastSeen"
      );
    }

    return res.status(200).json({ success: true, chat });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const { chatId, content } = req.body;
    const userId = req.user._id;

    if (!chatId || !content) {
      return res.status(400).json({ success: false, message: "Chat ID and content are required" });
    }

    const chat = await Chat.findById(chatId);
    if (!chat || !chat.participants.includes(userId)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const receiverId = chat.participants.find(
      (p) => p.toString() !== userId.toString()
    );

    const message = await Message.create({
      chat: chatId,
      sender: userId,
      receiver: receiverId,
      content,
    });

    await Chat.findByIdAndUpdate(chatId, {
      lastMessage: message._id,
      updatedAt: new Date(),
    });

    const populatedMessage = await Message.findById(message._id)
      .populate("sender", "name profilePic")
      .populate("receiver", "name profilePic");

    return res.status(201).json({ success: true, message: populatedMessage });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.markAsRead = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user._id;

    const chat = await Chat.findById(chatId);
    if (!chat || !chat.participants.includes(userId)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    await Message.updateMany(
      { chat: chatId, receiver: userId, isRead: false },
      { $set: { isRead: true } }
    );

    return res.status(200).json({ success: true, message: "Messages marked as read" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteChat = async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user._id;

    const chat = await Chat.findById(chatId);
    if (!chat || !chat.participants.includes(userId)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    await Message.deleteMany({ chat: chatId });
    await Chat.findByIdAndDelete(chatId);

    return res.status(200).json({ success: true, message: "Chat deleted successfully" });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};