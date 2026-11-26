const { describe, it } = require("node:test");
const assert = require("node:assert");
const mongoose = require("mongoose");

const User = require("../models/user.model");
const {
  calculateMatchScoreWithMusic,
  getSwipeProfiles,
  filterProfiles,
} = require("../controllers/match.controller");

describe("Component 6: Music-Based Discovery Integration", () => {
  const viewerId = new mongoose.Types.ObjectId();

  describe("calculateMatchScoreWithMusic Algorithm", () => {
    it("should award +10% bonus when viewer and candidate share the same Anthem artist", () => {
      const viewer = {
        interests: ["Travel"],
        anthemSong: { artist: "The Weeknd", name: "Starboy" },
        musicGenres: ["Pop"],
      };

      const candidate = {
        interests: ["Travel"],
        anthemSong: { artist: "The Weeknd", name: "Blinding Lights" },
        musicGenres: ["Classical"],
      };

      const result = calculateMatchScoreWithMusic(viewer, candidate);

      // Base 70 + shared interest (3) + same artist bonus (10) = 83
      assert.strictEqual(result.sharedAnthemArtist, true);
      assert.strictEqual(result.sharedMusicTaste, true);
      assert.strictEqual(result.musicBonus, 10);
      assert.strictEqual(result.matchScore, 83);
    });

    it("should award +5% bonus when viewer and candidate share 2 or more music genres", () => {
      const viewer = {
        interests: [],
        anthemSong: { artist: "Drake", name: "God's Plan" },
        musicGenres: ["Hip-Hop", "R&B / Soul", "Indie Rock"],
      };

      const candidate = {
        interests: [],
        anthemSong: { artist: "Taylor Swift", name: "Blank Space" },
        musicGenres: ["r&b / soul", "hip-hop", "Jazz"],
      };

      const result = calculateMatchScoreWithMusic(viewer, candidate);

      // Base 70 + 0 interest + 0 artist bonus + 5 genre bonus = 75
      assert.strictEqual(result.sharedAnthemArtist, false);
      assert.strictEqual(result.sharedGenresCount, 2);
      assert.strictEqual(result.sharedMusicTaste, true);
      assert.strictEqual(result.musicBonus, 5);
      assert.strictEqual(result.matchScore, 75);
    });

    it("should award +15% combined bonus when both anthem artist matches and 2+ genres match", () => {
      const viewer = {
        interests: ["Music", "Concerts"],
        anthemSong: { artist: "The Weeknd" },
        musicGenres: ["Hip-Hop", "R&B", "Pop"],
      };

      const candidate = {
        interests: ["Music", "Concerts"],
        anthemSong: { artist: "the weeknd" },
        musicGenres: ["R&B", "Hip-Hop", "Electronic"],
      };

      const result = calculateMatchScoreWithMusic(viewer, candidate);

      // Base 70 + 2 interests (6) + 10 (artist) + 5 (genres) = 91
      assert.strictEqual(result.sharedAnthemArtist, true);
      assert.strictEqual(result.sharedGenresCount, 2);
      assert.strictEqual(result.sharedMusicTaste, true);
      assert.strictEqual(result.musicBonus, 15);
      assert.strictEqual(result.matchScore, 91);
    });

    it("should not award music bonus when no anthem artist or < 2 genres match", () => {
      const viewer = {
        interests: [],
        anthemSong: { artist: "Post Malone" },
        musicGenres: ["Rap", "Pop"],
      };

      const candidate = {
        interests: [],
        anthemSong: { artist: "Coldplay" },
        musicGenres: ["Pop", "Rock"], // Only 1 common genre
      };

      const result = calculateMatchScoreWithMusic(viewer, candidate);

      assert.strictEqual(result.sharedAnthemArtist, false);
      assert.strictEqual(result.sharedGenresCount, 1);
      assert.strictEqual(result.sharedMusicTaste, false);
      assert.strictEqual(result.musicBonus, 0);
      assert.strictEqual(result.matchScore, 70);
    });
  });

  describe("GET /api/matches/feed - Music Taste & Match Score Serialization", () => {
    it("should return candidate profiles enriched with anthemSong, musicGenres, and matchScore", async () => {
      const originalFindById = User.findById;
      const originalFind = User.find;
      const originalCount = User.countDocuments;

      const mockViewer = {
        _id: viewerId,
        gender: "male",
        likes: [],
        passes: [],
        superLikes: [],
        blockedUsers: [],
        anthemSong: { artist: "The Weeknd", name: "Starboy" },
        musicGenres: ["Hip-Hop", "R&B"],
      };

      const mockCandidates = [
        {
          _id: new mongoose.Types.ObjectId(),
          name: "Sara",
          age: 24,
          gender: "female",
          anthemSong: {
            id: "track_xyz",
            name: "Blinding Lights",
            artist: "The Weeknd",
            albumArtUrl: "https://example.com/art.jpg",
            spotifyUrl: "https://open.spotify.com/track/xyz",
          },
          musicGenres: ["Hip-Hop", "R&B"],
          favoriteArtists: ["The Weeknd"],
        },
      ];

      User.findById = () => ({
        populate: async () => mockViewer,
      });

      User.find = () => ({
        select: () => ({
          sort: () => ({
            skip: () => ({
              limit: () => ({
                lean: async () => mockCandidates,
              }),
            }),
          }),
        }),
      });

      User.countDocuments = async () => 1;

      try {
        const req = {
          user: { id: viewerId.toString() },
          query: { page: 1, limit: 10 },
        };

        let status = 0;
        let json = null;
        const res = {
          status: (s) => {
            status = s;
            return { json: (j) => (json = j) };
          },
        };

        await getSwipeProfiles(req, res);

        assert.strictEqual(status, 200);
        assert.strictEqual(json.success, true);
        assert.strictEqual(json.profiles.length, 1);

        const profile = json.profiles[0];
        assert.strictEqual(profile.name, "Sara");
        // Verify music serialization
        assert.strictEqual(profile.anthemSong.artist, "The Weeknd");
        assert.deepStrictEqual(profile.musicGenres, ["Hip-Hop", "R&B"]);
        // Verify matchScore presence and bonus calculation
        assert.ok(typeof profile.matchScore === "number");
        assert.strictEqual(profile.sharedMusicTaste, true);
        assert.strictEqual(profile.matchScore, 85); // 70 base + 10 artist + 5 genres
      } finally {
        User.findById = originalFindById;
        User.find = originalFind;
        User.countDocuments = originalCount;
      }
    });
  });

  describe("POST /api/matches/filter - Filtering by musicGenres", () => {
    it("should construct MongoDB query with { musicGenres: { $in: [...] } }", async () => {
      let executedQuery = null;
      const originalFindById = User.findById;
      const originalFind = User.find;
      const originalCount = User.countDocuments;

      const mockViewer = {
        _id: viewerId,
        gender: "female",
        likes: [],
        passes: [],
        superLikes: [],
        blockedUsers: [],
        agePreference: { min: 20, max: 35 },
        distancePreference: 50,
        save: async () => {},
      };

      User.findById = () => ({
        populate: async () => mockViewer,
      });

      User.find = (query) => {
        executedQuery = query;
        return {
          select: () => ({
            sort: () => ({
              skip: () => ({
                limit: () => ({
                  lean: async () => [],
                }),
              }),
            }),
          }),
        };
      };

      User.countDocuments = async () => 0;

      try {
        const req = {
          user: { id: viewerId.toString() },
          body: {
            musicGenres: ["Hip-Hop", "Indie Rock"],
            ageMin: 22,
            ageMax: 30,
          },
          query: {},
        };

        let status = 0;
        let json = null;
        const res = {
          status: (s) => {
            status = s;
            return { json: (j) => (json = j) };
          },
        };

        await filterProfiles(req, res);

        assert.strictEqual(status, 200);
        assert.strictEqual(json.success, true);
        // Verify MongoDB array matching filter
        assert.ok(executedQuery);
        assert.ok(executedQuery.musicGenres);
        assert.deepStrictEqual(executedQuery.musicGenres.$in, ["Hip-Hop", "Indie Rock"]);
        // Verify existing filters preserved
        assert.strictEqual(executedQuery.age.$gte, 22);
        assert.strictEqual(executedQuery.age.$lte, 30);
      } finally {
        User.findById = originalFindById;
        User.find = originalFind;
        User.countDocuments = originalCount;
      }
    });
  });
});
