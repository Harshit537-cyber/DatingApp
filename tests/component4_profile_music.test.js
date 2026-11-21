require("dotenv").config();
process.env.SMTP_HOST = process.env.SMTP_HOST || "smtp.test.com";
process.env.SMTP_PORT = process.env.SMTP_PORT || "587";
process.env.SMTP_USER = process.env.SMTP_USER || "test@test.com";
process.env.SMTP_PASS = process.env.SMTP_PASS || "testpass";

const { describe, it } = require("node:test");
const assert = require("node:assert");
const mongoose = require("mongoose");

const User = require("../models/user.model");
const { updateProfile, getMe, getProfileById } = require("../controllers/auth.controller");

describe("Component 4: Profile Anthem & Music Preferences", () => {
  const dummyUserId = new mongoose.Types.ObjectId();
  const mockUser = {
    _id: dummyUserId,
    id: dummyUserId.toString(),
  };

  describe("PUT /api/user/profile - Anthem Song Updates", () => {
    it("should update anthemSong with full valid track metadata", async () => {
      let savedUpdates = null;
      const originalFindByIdAndUpdate = User.findByIdAndUpdate;

      User.findByIdAndUpdate = (id, updates) => {
        savedUpdates = updates;
        return {
          select: async () => ({
            _id: id,
            ...updates,
          }),
        };
      };

      try {
        const req = {
          user: mockUser,
          body: {
            anthemSong: {
              id: "track_4dH1jW6Z",
              name: "Starboy",
              artist: "The Weeknd",
              albumName: "Starboy",
              albumArtUrl: "https://example.com/starboy.jpg",
              spotifyUrl: "https://open.spotify.com/track/4dH1jW6Z",
              uri: "spotify:track:4dH1jW6Z",
            },
          },
        };

        let status = 0;
        let json = null;
        const res = {
          status: (s) => {
            status = s;
            return { json: (j) => (json = j) };
          },
        };

        await updateProfile(req, res);

        assert.strictEqual(status, 200);
        assert.strictEqual(json.success, true);
        assert.ok(savedUpdates.anthemSong);
        assert.strictEqual(savedUpdates.anthemSong.id, "track_4dH1jW6Z");
        assert.strictEqual(savedUpdates.anthemSong.name, "Starboy");
        assert.strictEqual(savedUpdates.anthemSong.artist, "The Weeknd");
        assert.strictEqual(savedUpdates.anthemSong.albumName, "Starboy");
      } finally {
        User.findByIdAndUpdate = originalFindByIdAndUpdate;
      }
    });

    it("should accept JSON stringified anthemSong and normalize legacy property names", async () => {
      let savedUpdates = null;
      const originalFindByIdAndUpdate = User.findByIdAndUpdate;

      User.findByIdAndUpdate = (id, updates) => {
        savedUpdates = updates;
        return {
          select: async () => ({ _id: id, ...updates }),
        };
      };

      try {
        const req = {
          user: mockUser,
          body: {
            anthemSong: JSON.stringify({
              trackId: "legacy_track_99",
              name: "Save Your Tears",
              artist: "The Weeknd",
              album: "After Hours",
              imageUrl: "https://example.com/afterhours.jpg",
              externalUrl: "https://open.spotify.com/track/legacy_99",
            }),
          },
        };

        let status = 0;
        let json = null;
        const res = {
          status: (s) => {
            status = s;
            return { json: (j) => (json = j) };
          },
        };

        await updateProfile(req, res);

        assert.strictEqual(status, 200);
        assert.strictEqual(savedUpdates.anthemSong.id, "legacy_track_99");
        assert.strictEqual(savedUpdates.anthemSong.albumName, "After Hours");
        assert.strictEqual(savedUpdates.anthemSong.albumArtUrl, "https://example.com/afterhours.jpg");
        assert.strictEqual(savedUpdates.anthemSong.spotifyUrl, "https://open.spotify.com/track/legacy_99");
      } finally {
        User.findByIdAndUpdate = originalFindByIdAndUpdate;
      }
    });

    it("should reject an anthemSong payload missing required fields (id, name, artist)", async () => {
      const req = {
        user: mockUser,
        body: {
          anthemSong: {
            albumName: "Some Album",
            // missing id, name, artist
          },
        },
      };

      let status = 0;
      let json = null;
      const res = {
        status: (s) => {
          status = s;
          return { json: (j) => (json = j) };
        },
      };

      await updateProfile(req, res);

      assert.strictEqual(status, 400);
      assert.strictEqual(json.success, false);
      assert.match(json.message, /requires id, name, and artist/i);
    });

    it("should allow clearing an anthemSong by passing null", async () => {
      let savedUpdates = null;
      const originalFindByIdAndUpdate = User.findByIdAndUpdate;

      User.findByIdAndUpdate = (id, updates) => {
        savedUpdates = updates;
        return { select: async () => ({ _id: id }) };
      };

      try {
        const req = {
          user: mockUser,
          body: { anthemSong: null },
        };

        let status = 0;
        const res = {
          status: (s) => {
            status = s;
            return { json: () => {} };
          },
        };

        await updateProfile(req, res);

        assert.strictEqual(status, 200);
        assert.strictEqual(savedUpdates.anthemSong, null);
      } finally {
        User.findByIdAndUpdate = originalFindByIdAndUpdate;
      }
    });
  });

  describe("PUT /api/user/profile - Music Genres & Favorite Artists", () => {
    it("should accept musicGenres as array and comma-separated string", async () => {
      let savedUpdates = null;
      const originalFindByIdAndUpdate = User.findByIdAndUpdate;

      User.findByIdAndUpdate = (id, updates) => {
        savedUpdates = updates;
        return { select: async () => ({ _id: id, ...updates }) };
      };

      try {
        // Test comma-separated string
        const req1 = {
          user: mockUser,
          body: {
            musicGenres: "Hip-Hop, R&B / Soul, Indie Rock",
            favoriteArtists: "The Weeknd, Drake, Arctic Monkeys",
          },
        };

        let status = 0;
        const res = {
          status: (s) => {
            status = s;
            return { json: () => {} };
          },
        };

        await updateProfile(req1, res);

        assert.strictEqual(status, 200);
        assert.deepStrictEqual(savedUpdates.musicGenres, ["Hip-Hop", "R&B / Soul", "Indie Rock"]);
        assert.deepStrictEqual(savedUpdates.favoriteArtists, ["The Weeknd", "Drake", "Arctic Monkeys"]);
      } finally {
        User.findByIdAndUpdate = originalFindByIdAndUpdate;
      }
    });
  });

  describe("PUT /api/user/profile - Mass Assignment Protection", () => {
    it("should strip spotify credentials and server-managed fields from updates", async () => {
      let savedUpdates = null;
      const originalFindByIdAndUpdate = User.findByIdAndUpdate;

      User.findByIdAndUpdate = (id, updates) => {
        savedUpdates = updates;
        return { select: async () => ({ _id: id, ...updates }) };
      };

      try {
        const req = {
          user: mockUser,
          body: {
            bio: "Updated bio",
            // Malicious mass-assignment payload attempts:
            spotify: {
              isConnected: true,
              accessToken: "fake_token",
              refreshToken: "fake_refresh",
            },
            isVerified: true,
            walletBalance: 1000000,
            tokenVersion: 999,
          },
        };

        let status = 0;
        const res = {
          status: (s) => {
            status = s;
            return { json: () => {} };
          },
        };

        await updateProfile(req, res);

        assert.strictEqual(status, 200);
        assert.strictEqual(savedUpdates.bio, "Updated bio");
        // Critical assertions: Stripped fields
        assert.strictEqual(savedUpdates.spotify, undefined);
        assert.strictEqual(savedUpdates.isVerified, undefined);
        assert.strictEqual(savedUpdates.walletBalance, undefined);
        assert.strictEqual(savedUpdates.tokenVersion, undefined);
      } finally {
        User.findByIdAndUpdate = originalFindByIdAndUpdate;
      }
    });
  });

  describe("GET /api/user/profile - Profile Retrieval Sanitization", () => {
    it("should return public music fields without exposing Spotify tokens", async () => {
      const originalFindById = User.findById;

      User.findById = (id) => ({
        select: async () => ({
          _id: id,
          name: "Alex",
          anthemSong: {
            id: "track_123",
            name: "Starboy",
            artist: "The Weeknd",
          },
          musicGenres: ["Hip-Hop", "R&B"],
          favoriteArtists: ["The Weeknd"],
          spotify: {
            isConnected: true,
            spotifyId: "spotify_alex_123",
            displayName: "Alex",
            // tokens are excluded by select('-password') and schema select: false
          },
        }),
      });

      try {
        const req = { user: mockUser };
        let status = 0;
        let json = null;
        const res = {
          status: (s) => {
            status = s;
            return { json: (j) => (json = j) };
          },
        };

        await getMe(req, res);

        assert.strictEqual(status, 200);
        assert.ok(json.user);
        assert.strictEqual(json.user.anthemSong.name, "Starboy");
        assert.strictEqual(json.user.musicGenres[0], "Hip-Hop");
        assert.strictEqual(json.user.spotify.isConnected, true);
        assert.strictEqual(json.user.spotify.accessToken, undefined);
        assert.strictEqual(json.user.spotify.refreshToken, undefined);
      } finally {
        User.findById = originalFindById;
      }
    });
  });
});
