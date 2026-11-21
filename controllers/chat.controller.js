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
    const {
      chatId,
      content,
      message: bodyMessage,
      isMusicShare,
      trackId,
      trackName,
      artistName,
      albumName,
      albumArtUrl,
      spotifyUrl,
    } = req.body;
    const userId = req.user._id;

    const isMusic = Boolean(isMusicShare);
    const rawText = bodyMessage || content || "";

    if (!chatId) {
      return res.status(400).json({ success: false, message: "Chat ID is required" });
    }

    if (isMusic) {
      if (!trackId || !trackName || !artistName) {
        return res.status(400).json({
          success: false,
          message: "trackId, trackName, and artistName are required for music sharing",
        });
      }
    } else if (!rawText || !rawText.trim()) {
      return res.status(400).json({ success: false, message: "Message content is required" });
    }

    const chat = await Chat.findById(chatId);
    if (!chat || !chat.participants.some((p) => p.toString() === userId.toString())) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    const receiverId = chat.participants.find(
      (p) => p.toString() !== userId.toString()
    );

    const messageText = rawText.trim() || `Shared a track: ${trackName} by ${artistName}`;
    const musicShareData = isMusic
      ? {
          trackId: String(trackId),
          trackName: String(trackName),
          artistName: String(artistName),
          albumName: String(albumName || ""),
          albumArtUrl: String(albumArtUrl || ""),
          spotifyUrl: String(spotifyUrl || ""),
        }
      : null;

    const message = await Message.create({
      chat: chatId,
      sender: userId,
      receiver: receiverId,
      message: messageText,
      messageType: isMusic ? "music" : "text",
      isMusicShare: isMusic,
      musicShare: musicShareData,
    });

    chat.lastMessage = isMusic ? `🎵 ${trackName} - ${artistName}` : messageText;
    chat.lastMessageAt = new Date();
    await chat.save();

    const populatedMessage = await Message.findById(message._id)
      .populate("sender", "name profilePic")
      .populate("receiver", "name profilePic");

    const io = req.app.get("io");
    if (io) {
      io.to(chatId.toString()).emit("receiveMessage", populatedMessage);
      io.to(receiverId.toString()).emit("newMessageNotification", {
        chatId,
        senderId: userId,
        message: messageText,
        isMusicShare: isMusic,
        musicShare: musicShareData,
      });
    }

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