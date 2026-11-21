const { describe, it } = require("node:test");
const assert = require("node:assert");
const mongoose = require("mongoose");

const Message = require("../models/message.model");
const Chat = require("../models/chat.model");
const User = require("../models/user.model");
const Notification = require("../models/notification.model");
const { sendMessage: restSendMessage } = require("../controllers/chat.controller");

describe("Component 5: Chat Music Sharing Integration", () => {
  const userId = new mongoose.Types.ObjectId();
  const receiverId = new mongoose.Types.ObjectId();
  const unauthorizedUserId = new mongoose.Types.ObjectId();
  const chatId = new mongoose.Types.ObjectId();

  describe("Message Model & Persistence for Music Sharing", () => {
    it("should instantiate a valid music share message document", () => {
      const msg = new Message({
        chat: chatId,
        sender: userId,
        receiver: receiverId,
        message: "Check this out!",
        messageType: "music",
        isMusicShare: true,
        musicShare: {
          trackId: "track_xyz",
          trackName: "Blinding Lights",
          artistName: "The Weeknd",
          albumName: "After Hours",
          albumArtUrl: "https://example.com/art.jpg",
          spotifyUrl: "https://open.spotify.com/track/track_xyz",
        },
      });

      assert.strictEqual(msg.isMusicShare, true);
      assert.strictEqual(msg.messageType, "music");
      assert.strictEqual(msg.musicShare.trackId, "track_xyz");
      assert.strictEqual(msg.musicShare.trackName, "Blinding Lights");
      assert.strictEqual(msg.musicShare.artistName, "The Weeknd");
    });

    it("should preserve normal text messages without music metadata", () => {
      const textMsg = new Message({
        chat: chatId,
        sender: userId,
        receiver: receiverId,
        message: "Hey, how are you?",
      });

      assert.strictEqual(textMsg.isMusicShare, false);
      assert.strictEqual(textMsg.messageType, "text");
      assert.strictEqual(textMsg.musicShare.trackId, null);
    });
  });

  describe("REST Chat Controller - sendMessage", () => {
    it("should reject message if user is not a participant in the chat", async () => {
      const originalFindById = Chat.findById;
      Chat.findById = async () => ({
        _id: chatId,
        participants: [userId, receiverId],
      });

      try {
        const req = {
          user: { _id: unauthorizedUserId },
          body: {
            chatId: chatId.toString(),
            content: "I want to snoop",
          },
          app: { get: () => null },
        };

        let status = 0;
        let json = null;
        const res = {
          status: (s) => {
            status = s;
            return { json: (j) => (json = j) };
          },
        };

        await restSendMessage(req, res);

        assert.strictEqual(status, 403);
        assert.match(json.message, /Access denied/i);
      } finally {
        Chat.findById = originalFindById;
      }
    });

    it("should send and persist a music share message with track card", async () => {
      let createdDoc = null;
      let updatedChat = null;

      const originalChatFindById = Chat.findById;
      const originalMessageCreate = Message.create;
      const originalMessageFindById = Message.findById;

      Chat.findById = async () => ({
        _id: chatId,
        participants: [userId, receiverId],
        save: async function () {
          updatedChat = this;
        },
      });

      Message.create = async (doc) => {
        createdDoc = { _id: new mongoose.Types.ObjectId(), ...doc };
        return createdDoc;
      };

      Message.findById = () => ({
        populate: () => ({
          populate: async () => createdDoc,
        }),
      });

      try {
        const req = {
          user: { _id: userId },
          body: {
            chatId: chatId.toString(),
            isMusicShare: true,
            trackId: "track_starboy_1",
            trackName: "Starboy",
            artistName: "The Weeknd",
            albumName: "Starboy",
            albumArtUrl: "https://example.com/starboy.jpg",
            spotifyUrl: "https://open.spotify.com/track/starboy",
          },
          app: { get: () => null },
        };

        let status = 0;
        let json = null;
        const res = {
          status: (s) => {
            status = s;
            return { json: (j) => (json = j) };
          },
        };

        await restSendMessage(req, res);

        assert.strictEqual(status, 201);
        assert.strictEqual(json.success, true);

        // Verification of created message
        assert.ok(createdDoc);
        assert.strictEqual(createdDoc.isMusicShare, true);
        assert.strictEqual(createdDoc.messageType, "music");
        assert.strictEqual(createdDoc.musicShare.trackName, "Starboy");
        assert.strictEqual(createdDoc.musicShare.artistName, "The Weeknd");
        assert.strictEqual(createdDoc.message, "Shared a track: Starboy by The Weeknd");

        // Verification of chat preview
        assert.strictEqual(updatedChat.lastMessage, "🎵 Starboy - The Weeknd");
      } finally {
        Chat.findById = originalChatFindById;
        Message.create = originalMessageCreate;
        Message.findById = originalMessageFindById;
      }
    });

    it("should reject music share if trackId, trackName, or artistName is missing", async () => {
      const req = {
        user: { _id: userId },
        body: {
          chatId: chatId.toString(),
          isMusicShare: true,
          // Missing trackId and artistName
          trackName: "Mystery Song",
        },
        app: { get: () => null },
      };

      let status = 0;
      let json = null;
      const res = {
        status: (s) => {
          status = s;
          return { json: (j) => (json = j) };
        },
      };

      await restSendMessage(req, res);

      assert.strictEqual(status, 400);
      assert.match(json.message, /trackId, trackName, and artistName are required/i);
    });
  });
});
