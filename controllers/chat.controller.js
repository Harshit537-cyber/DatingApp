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