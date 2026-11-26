const { describe, it } = require("node:test");
const assert = require("node:assert");
const mongoose = require("mongoose");

// Initialize test environment
process.env.JWT_SECRET = "test_jwt_secret_for_bummps_backend";

const Poll = require("../models/poll.model");
const PollVote = require("../models/pollVote.model");
const Discussion = require("../models/discussion.model");
const pollController = require("../controllers/poll.controller");
const discussionController = require("../controllers/discussion.controller");

describe("Community Polls, Voting & The Buzz Discussion Integration", () => {
  const dummyUserId = new mongoose.Types.ObjectId();
  const dummyOtherUserId = new mongoose.Types.ObjectId();
  const dummyAdminId = new mongoose.Types.ObjectId();

  const mockUser = {
    _id: dummyUserId,
    id: dummyUserId.toString(),
    name: "Elena R.",
    profilePic: "https://images.unsplash.com/photo-1534528741775-53994a69daeb",
  };

  const mockOtherUser = {
    _id: dummyOtherUserId,
    id: dummyOtherUserId.toString(),
    name: "Marcus V.",
    profilePic: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d",
  };

  const mockAdmin = {
    _id: dummyAdminId,
    id: dummyAdminId.toString(),
    role: "superadmin",
  };

  // Helper to create mock response object
  function createMockRes() {
    return {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.body = data;
        return this;
      },
    };
  }

  // --- 1. Model Schema & Validation Unit Tests ---
  describe("Module A & B: Poll and PollVote Models Schema & Constraints", () => {
    it("should instantiate a valid Poll model document with correct defaults and options", () => {
      const poll = new Poll({
        createdBy: dummyUserId,
        question: "First Date Vibe: Speakeasy Cocktails or Candlelit Rooftop?",
        category: "DATING VIBE",
        options: [
          { optionIndex: 0, optionText: "🍸 Speakeasy Cocktails", voteCount: 0 },
          { optionIndex: 1, optionText: "🕯️ Candlelit Rooftop", voteCount: 0 },
        ],
      });

      assert.strictEqual(poll.totalVotes, 0);
      assert.strictEqual(poll.status, "active");
      assert.strictEqual(poll.options.length, 2);
      assert.strictEqual(poll.options[0].optionIndex, 0);
      assert.ok(poll.expiresAt instanceof Date);
    });

    it("should reject a Poll with fewer than 2 options at schema level", () => {
      const poll = new Poll({
        createdBy: dummyUserId,
        question: "Invalid Poll",
        category: "DATING VIBE",
        options: [{ optionIndex: 0, optionText: "Only one option" }],
      });

      const err = poll.validateSync();
      assert.ok(err, "Validation error expected");
      assert.ok(err.errors["options"]);
    });

    it("should reject a Poll with more than 4 options at schema level", () => {
      const poll = new Poll({
        createdBy: dummyUserId,
        question: "Too many options",
        category: "DATING VIBE",
        options: [
          { optionIndex: 0, optionText: "Option 1" },
          { optionIndex: 1, optionText: "Option 2" },
          { optionIndex: 2, optionText: "Option 3" },
          { optionIndex: 3, optionText: "Option 4" },
          { optionIndex: 4, optionText: "Option 5" },
        ],
      });

      const err = poll.validateSync();
      assert.ok(err, "Validation error expected for > 4 options");
      assert.ok(err.errors["options"]);
    });

    it("should reject an invalid category enum at schema level", () => {
      const poll = new Poll({
        createdBy: dummyUserId,
        question: "Invalid category",
        category: "UNKNOWN_CATEGORY",
        options: [
          { optionIndex: 0, optionText: "Opt 1" },
          { optionIndex: 1, optionText: "Opt 2" },
        ],
      });

      const err = poll.validateSync();
      assert.ok(err, "Validation error expected for unknown category");
      assert.ok(err.errors["category"]);
    });

    it("should have compound unique index on PollVote model { pollId: 1, userId: 1 }", () => {
      const indexes = PollVote.schema.indexes();
      const compoundIndex = indexes.find(
        (idx) => idx[0].pollId === 1 && idx[0].userId === 1 && idx[1]?.unique === true
      );
      assert.ok(compoundIndex, "PollVote must have { pollId: 1, userId: 1 } unique index");
    });

    it("should have status and createdAt index on Poll model { status: 1, createdAt: -1 }", () => {
      const indexes = Poll.schema.indexes();
      const statusIndex = indexes.find(
        (idx) => idx[0].status === 1 && idx[0].createdAt === -1
      );
      assert.ok(statusIndex, "Poll must have { status: 1, createdAt: -1 } index");
    });

    it("should support pollId and isPoll on Discussion model", () => {
      const disc = new Discussion({
        category: "DATING VIBE",
        title: "Test Discussion",
        createdBy: dummyUserId,
        pollId: new mongoose.Types.ObjectId(),
        isPoll: true,
      });

      assert.strictEqual(disc.isPoll, true);
      assert.ok(disc.pollId instanceof mongoose.Types.ObjectId);
    });
  });

  // --- 2. Dynamic Percentage Calculation Helper ---
  describe("Dynamic Percentage Math (formatPollResponse)", () => {
    it("should calculate percentages dynamically with 1 decimal precision", () => {
      const mockPoll = {
        _id: new mongoose.Types.ObjectId(),
        question: "Sample Question",
        category: "DATING VIBE",
        totalVotes: 185,
        options: [
          { optionIndex: 0, optionText: "🍸 Speakeasy Cocktails", voteCount: 118 },
          { optionIndex: 1, optionText: "🕯️ Candlelit Rooftop", voteCount: 67 },
        ],
        status: "active",
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
        createdBy: mockUser,
      };

      const userVote = { optionIndex: 0 };
      const res = pollController.formatPollResponse(mockPoll, userVote);

      assert.strictEqual(res.totalVotes, 185);
      assert.strictEqual(res.hasVoted, true);
      assert.strictEqual(res.userSelectedOptionIndex, 0);

      // 118 / 185 * 100 = 63.783... -> 63.8
      assert.strictEqual(res.options[0].percentage, 63.8);
      // 67 / 185 * 100 = 36.216... -> 36.2
      assert.strictEqual(res.options[1].percentage, 36.2);
    });

    it("should return 0.0 percentage when totalVotes is zero", () => {
      const mockPoll = {
        _id: new mongoose.Types.ObjectId(),
        question: "Fresh Question",
        category: "DATING VIBE",
        totalVotes: 0,
        options: [
          { optionIndex: 0, optionText: "Option A", voteCount: 0 },
          { optionIndex: 1, optionText: "Option B", voteCount: 0 },
        ],
        status: "active",
      };

      const res = pollController.formatPollResponse(mockPoll, null);
      assert.strictEqual(res.hasVoted, false);
      assert.strictEqual(res.userSelectedOptionIndex, null);
      assert.strictEqual(res.options[0].percentage, 0.0);
      assert.strictEqual(res.options[1].percentage, 0.0);
    });
  });

  // --- 3. Endpoint 1: Create Poll & Auto Discussion ---
  describe("POST /api/circle/polls (Create Poll)", () => {
    it("should create a poll and auto-create a linked CircleDiscussion in The Buzz", async () => {
      const pollId = new mongoose.Types.ObjectId();
      const discussionId = new mongoose.Types.ObjectId();

      let savedPoll = null;
      let savedDiscussion = null;

      // Mock Poll save
      const origPollSave = Poll.prototype.save;
      Poll.prototype.save = async function () {
        this._id = this._id || pollId;
        savedPoll = this;
        return this;
      };

      // Mock Discussion save
      const origDiscSave = Discussion.prototype.save;
      Discussion.prototype.save = async function () {
        this._id = this._id || discussionId;
        savedDiscussion = this;
        return this;
      };

      try {
        const req = {
          user: mockUser,
          body: {
            question: "First Date Vibe: Speakeasy Cocktails or Candlelit Rooftop?",
            category: "DATING VIBE",
            options: ["🍸 Speakeasy Cocktails", "🕯️ Candlelit Rooftop"],
            durationDays: 7,
          },
        };
        const res = createMockRes();

        await pollController.createPoll(req, res);

        assert.strictEqual(res.statusCode, 201);
        assert.strictEqual(res.body.success, true);
        assert.ok(res.body.data.poll);
        assert.ok(res.body.data.discussion);

        // Verify bidirectional linking
        assert.strictEqual(res.body.data.poll.question, req.body.question);
        assert.strictEqual(res.body.data.poll.options.length, 2);
        assert.strictEqual(res.body.data.poll.discussionId.toString(), savedDiscussion._id.toString());

        assert.strictEqual(res.body.data.discussion.pollId.toString(), savedPoll._id.toString());
        assert.strictEqual(res.body.data.discussion.isPoll, true);
        assert.strictEqual(res.body.data.discussion.title, req.body.question);
      } finally {
        Poll.prototype.save = origPollSave;
        Discussion.prototype.save = origDiscSave;
      }
    });

    it("should reject poll creation if question is missing or empty", async () => {
      const req = {
        user: mockUser,
        body: {
          question: "   ",
          category: "DATING VIBE",
          options: ["Opt 1", "Opt 2"],
        },
      };
      const res = createMockRes();

      await pollController.createPoll(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.success, false);
      assert.match(res.body.message, /question is required/i);
    });

    it("should reject poll creation if question exceeds 250 characters", async () => {
      const req = {
        user: mockUser,
        body: {
          question: "A".repeat(251),
          category: "DATING VIBE",
          options: ["Opt 1", "Opt 2"],
        },
      };
      const res = createMockRes();

      await pollController.createPoll(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.success, false);
      assert.match(res.body.message, /cannot exceed 250 characters/i);
    });

    it("should reject poll creation with fewer than 2 options", async () => {
      const req = {
        user: mockUser,
        body: {
          question: "Valid Question",
          category: "DATING VIBE",
          options: ["Only one option"],
        },
      };
      const res = createMockRes();

      await pollController.createPoll(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.success, false);
      assert.match(res.body.message, /between 2 and 4 options/i);
    });

    it("should reject poll creation with more than 4 options", async () => {
      const req = {
        user: mockUser,
        body: {
          question: "Valid Question",
          category: "DATING VIBE",
          options: ["Opt 1", "Opt 2", "Opt 3", "Opt 4", "Opt 5"],
        },
      };
      const res = createMockRes();

      await pollController.createPoll(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.success, false);
      assert.match(res.body.message, /between 2 and 4 options/i);
    });

    it("should reject poll creation with invalid category", async () => {
      const req = {
        user: mockUser,
        body: {
          question: "Valid Question",
          category: "INVALID_CATEGORY_NAME",
          options: ["Opt 1", "Opt 2"],
        },
      };
      const res = createMockRes();

      await pollController.createPoll(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.success, false);
      assert.match(res.body.message, /Invalid category/i);
    });

    it("should reject poll creation with invalid durationDays", async () => {
      const req = {
        user: mockUser,
        body: {
          question: "Valid Question",
          category: "DATING VIBE",
          options: ["Opt 1", "Opt 2"],
          durationDays: -5,
        },
      };
      const res = createMockRes();

      await pollController.createPoll(req, res);

      assert.strictEqual(res.statusCode, 400);
      assert.strictEqual(res.body.success, false);
      assert.match(res.body.message, /durationDays must be a positive integer/i);
    });
  });

  // --- 4. Endpoint 2: Get Community Polls Feed ---
  describe("GET /api/circle/polls (Polls Feed)", () => {
    it("should return paginated polls with batch-resolved user votes and percentages", async () => {
      const poll1Id = new mongoose.Types.ObjectId();
      const poll2Id = new mongoose.Types.ObjectId();

      const mockPollsList = [
        {
          _id: poll1Id,
          question: "Question 1",
          category: "DATING VIBE",
          totalVotes: 10,
          options: [
            { optionIndex: 0, optionText: "A", voteCount: 6 },
            { optionIndex: 1, optionText: "B", voteCount: 4 },
          ],
          status: "active",
          createdAt: new Date(),
          createdBy: mockUser,
        },
        {
          _id: poll2Id,
          question: "Question 2",
          category: "FIRST MOVES",
          totalVotes: 0,
          options: [
            { optionIndex: 0, optionText: "X", voteCount: 0 },
            { optionIndex: 1, optionText: "Y", voteCount: 0 },
          ],
          status: "active",
          createdAt: new Date(),
          createdBy: mockOtherUser,
        },
      ];

      // Mock Poll.find query chain
      const origFind = Poll.find;
      Poll.find = function () {
        return {
          populate: function () {
            return {
              sort: function () {
                return {
                  skip: function () {
                    return {
                      limit: async function () {
                        return mockPollsList;
                      },
                    };
                  },
                };
              },
            };
          },
        };
      };

      const origCount = Poll.countDocuments;
      Poll.countDocuments = async () => 2;

      // Mock PollVote batch query
      const origVoteFind = PollVote.find;
      PollVote.find = async () => [
        {
          pollId: poll1Id,
          userId: mockUser._id,
          optionIndex: 0,
        },
      ];

      try {
        const req = {
          user: mockUser,
          query: { page: "1", limit: "10" },
        };
        const res = createMockRes();

        await pollController.getPolls(req, res);

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.data.polls.length, 2);

        // Verify poll 1 (voted)
        const p1 = res.body.data.polls[0];
        assert.strictEqual(p1.hasVoted, true);
        assert.strictEqual(p1.userSelectedOptionIndex, 0);
        assert.strictEqual(p1.options[0].percentage, 60.0);
        assert.strictEqual(p1.options[1].percentage, 40.0);

        // Verify poll 2 (not voted)
        const p2 = res.body.data.polls[1];
        assert.strictEqual(p2.hasVoted, false);
        assert.strictEqual(p2.userSelectedOptionIndex, null);

        // Verify pagination
        assert.strictEqual(res.body.data.pagination.total, 2);
        assert.strictEqual(res.body.data.pagination.page, 1);
        assert.strictEqual(res.body.data.pagination.pages, 1);
      } finally {
        Poll.find = origFind;
        Poll.countDocuments = origCount;
        PollVote.find = origVoteFind;
      }
    });
  });

  // --- 5. Endpoint 3: Cast a Vote ---
  describe("POST /api/circle/polls/:id/vote (Cast a Vote)", () => {
    it("should cast a vote successfully, incrementing counts and returning updated percentages", async () => {
      const pollId = new mongoose.Types.ObjectId();

      const existingPoll = {
        _id: pollId,
        question: "Voting Question",
        category: "DATING VIBE",
        status: "active",
        expiresAt: new Date(Date.now() + 86400000),
        options: [
          { optionIndex: 0, optionText: "Option 0", voteCount: 0 },
          { optionIndex: 1, optionText: "Option 1", voteCount: 0 },
        ],
      };

      const origFindById = Poll.findById;
      Poll.findById = async () => existingPoll;

      const origVoteCreate = PollVote.create;
      let recordedVote = null;
      PollVote.create = async (doc) => {
        recordedVote = doc;
        return doc;
      };

      const origFindOneAndUpdate = Poll.findOneAndUpdate;
      Poll.findOneAndUpdate = function () {
        return {
          populate: async () => ({
            _id: pollId,
            question: existingPoll.question,
            category: existingPoll.category,
            totalVotes: 1,
            options: [
              { optionIndex: 0, optionText: "Option 0", voteCount: 1 },
              { optionIndex: 1, optionText: "Option 1", voteCount: 0 },
            ],
            status: "active",
            createdBy: mockUser,
          }),
        };
      };

      try {
        const req = {
          params: { id: pollId.toString() },
          body: { optionIndex: 0 },
          user: mockUser,
        };
        const res = createMockRes();

        await pollController.votePoll(req, res);

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.data.totalVotes, 1);
        assert.strictEqual(res.body.data.hasVoted, true);
        assert.strictEqual(res.body.data.userSelectedOptionIndex, 0);
        assert.strictEqual(res.body.data.options[0].voteCount, 1);
        assert.strictEqual(res.body.data.options[0].percentage, 100.0);
      } finally {
        Poll.findById = origFindById;
        PollVote.create = origVoteCreate;
        Poll.findOneAndUpdate = origFindOneAndUpdate;
      }
    });

    it("should reject double voting with HTTP 409 Conflict (E11000 duplicate key)", async () => {
      const pollId = new mongoose.Types.ObjectId();

      const existingPoll = {
        _id: pollId,
        status: "active",
        expiresAt: new Date(Date.now() + 86400000),
        options: [
          { optionIndex: 0, optionText: "Option 0", voteCount: 1 },
          { optionIndex: 1, optionText: "Option 1", voteCount: 0 },
        ],
      };

      const origFindById = Poll.findById;
      Poll.findById = async () => existingPoll;

      const origVoteCreate = PollVote.create;
      PollVote.create = async () => {
        const err = new Error("E11000 duplicate key error collection");
        err.code = 11000;
        throw err;
      };

      try {
        const req = {
          params: { id: pollId.toString() },
          body: { optionIndex: 0 },
          user: mockUser,
        };
        const res = createMockRes();

        await pollController.votePoll(req, res);

        assert.strictEqual(res.statusCode, 409);
        assert.strictEqual(res.body.success, false);
        assert.match(res.body.message, /already voted/i);
      } finally {
        Poll.findById = origFindById;
        PollVote.create = origVoteCreate;
      }
    });

    it("should reject voting on an expired poll with HTTP 410 Gone", async () => {
      const pollId = new mongoose.Types.ObjectId();

      const expiredPoll = {
        _id: pollId,
        status: "active",
        expiresAt: new Date(Date.now() - 10000), // Expired in past
        options: [
          { optionIndex: 0, optionText: "Option 0", voteCount: 5 },
          { optionIndex: 1, optionText: "Option 1", voteCount: 2 },
        ],
      };

      const origFindById = Poll.findById;
      Poll.findById = async () => expiredPoll;

      try {
        const req = {
          params: { id: pollId.toString() },
          body: { optionIndex: 0 },
          user: mockUser,
        };
        const res = createMockRes();

        await pollController.votePoll(req, res);

        assert.strictEqual(res.statusCode, 410);
        assert.strictEqual(res.body.success, false);
        assert.match(res.body.message, /closed or has expired/i);
      } finally {
        Poll.findById = origFindById;
      }
    });

    it("should reject voting with an invalid option index", async () => {
      const pollId = new mongoose.Types.ObjectId();

      const activePoll = {
        _id: pollId,
        status: "active",
        expiresAt: new Date(Date.now() + 86400000),
        options: [
          { optionIndex: 0, optionText: "Option 0", voteCount: 0 },
          { optionIndex: 1, optionText: "Option 1", voteCount: 0 },
        ],
      };

      const origFindById = Poll.findById;
      Poll.findById = async () => activePoll;

      try {
        const req = {
          params: { id: pollId.toString() },
          body: { optionIndex: 99 }, // Non-existent index
          user: mockUser,
        };
        const res = createMockRes();

        await pollController.votePoll(req, res);

        assert.strictEqual(res.statusCode, 400);
        assert.strictEqual(res.body.success, false);
        assert.match(res.body.message, /Invalid option selected/i);
      } finally {
        Poll.findById = origFindById;
      }
    });
  });

  // --- 6. Endpoint 4: Get Individual Poll Details ---
  describe("GET /api/circle/polls/:id (Single Poll Details)", () => {
    it("should return single poll details with user vote state and percentages", async () => {
      const pollId = new mongoose.Types.ObjectId();
      const mockPoll = {
        _id: pollId,
        question: "Single Poll Question",
        category: "GREEN FLAGS",
        totalVotes: 50,
        options: [
          { optionIndex: 0, optionText: "Green Flag A", voteCount: 30 },
          { optionIndex: 1, optionText: "Green Flag B", voteCount: 20 },
        ],
        status: "active",
        expiresAt: new Date(Date.now() + 86400000),
        createdAt: new Date(),
        createdBy: mockUser,
      };

      const origFindById = Poll.findById;
      Poll.findById = function () {
        return {
          populate: async () => mockPoll,
        };
      };

      const origVoteFindOne = PollVote.findOne;
      PollVote.findOne = async () => ({
        pollId,
        userId: mockUser._id,
        optionIndex: 0,
      });

      try {
        const req = {
          params: { id: pollId.toString() },
          user: mockUser,
        };
        const res = createMockRes();

        await pollController.getPollById(req, res);

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.data.hasVoted, true);
        assert.strictEqual(res.body.data.userSelectedOptionIndex, 0);
        assert.strictEqual(res.body.data.options[0].percentage, 60.0);
        assert.strictEqual(res.body.data.options[1].percentage, 40.0);
      } finally {
        Poll.findById = origFindById;
        PollVote.findOne = origVoteFindOne;
      }
    });

    it("should return 404 if poll is not found", async () => {
      const origFindById = Poll.findById;
      Poll.findById = function () {
        return {
          populate: async () => null,
        };
      };

      try {
        const req = {
          params: { id: new mongoose.Types.ObjectId().toString() },
          user: mockUser,
        };
        const res = createMockRes();

        await pollController.getPollById(req, res);

        assert.strictEqual(res.statusCode, 404);
        assert.strictEqual(res.body.success, false);
        assert.match(res.body.message, /not found/i);
      } finally {
        Poll.findById = origFindById;
      }
    });
  });

  // --- 7. Endpoint 5: Delete Poll & Authorization ---
  describe("DELETE /api/circle/polls/:id (Poll Deletion)", () => {
    it("should allow poll creator to delete their poll and associated votes", async () => {
      const pollId = new mongoose.Types.ObjectId();
      const discussionId = new mongoose.Types.ObjectId();

      const mockPoll = {
        _id: pollId,
        createdBy: mockUser._id,
        discussionId,
      };

      const origFindById = Poll.findById;
      Poll.findById = async () => mockPoll;

      let votesDeleted = false;
      const origVoteDeleteMany = PollVote.deleteMany;
      PollVote.deleteMany = async () => {
        votesDeleted = true;
      };

      let pollDeleted = false;
      const origPollDelete = Poll.findByIdAndDelete;
      Poll.findByIdAndDelete = async () => {
        pollDeleted = true;
      };

      let discussionDeleted = false;
      const origDiscFindById = Discussion.findById;
      Discussion.findById = async () => ({
        _id: discussionId,
        repliesCount: 0,
      });

      const origDiscDelete = Discussion.findByIdAndDelete;
      Discussion.findByIdAndDelete = async () => {
        discussionDeleted = true;
      };

      try {
        const req = {
          params: { id: pollId.toString() },
          user: mockUser,
        };
        const res = createMockRes();

        await pollController.deletePoll(req, res);

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(votesDeleted, true);
        assert.strictEqual(pollDeleted, true);
        assert.strictEqual(discussionDeleted, true);
      } finally {
        Poll.findById = origFindById;
        PollVote.deleteMany = origVoteDeleteMany;
        Poll.findByIdAndDelete = origPollDelete;
        Discussion.findById = origDiscFindById;
        Discussion.findByIdAndDelete = origDiscDelete;
      }
    });

    it("should allow an administrator to delete any poll", async () => {
      const pollId = new mongoose.Types.ObjectId();

      const mockPoll = {
        _id: pollId,
        createdBy: mockOtherUser._id, // Created by other user
      };

      const origFindById = Poll.findById;
      Poll.findById = async () => mockPoll;
      const origVoteDeleteMany = PollVote.deleteMany;
      PollVote.deleteMany = async () => {};
      const origPollDelete = Poll.findByIdAndDelete;
      Poll.findByIdAndDelete = async () => {};

      try {
        const req = {
          params: { id: pollId.toString() },
          admin: mockAdmin, // Admin auth context
        };
        const res = createMockRes();

        await pollController.deletePoll(req, res);

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.match(res.body.message, /deleted successfully/i);
      } finally {
        Poll.findById = origFindById;
        PollVote.deleteMany = origVoteDeleteMany;
        Poll.findByIdAndDelete = origPollDelete;
      }
    });

    it("should reject unauthorized deletion by a non-owner user with HTTP 403", async () => {
      const pollId = new mongoose.Types.ObjectId();

      const mockPoll = {
        _id: pollId,
        createdBy: mockOtherUser._id, // Created by Marcus
      };

      const origFindById = Poll.findById;
      Poll.findById = async () => mockPoll;

      try {
        const req = {
          params: { id: pollId.toString() },
          user: mockUser, // Elena trying to delete Marcus's poll
        };
        const res = createMockRes();

        await pollController.deletePoll(req, res);

        assert.strictEqual(res.statusCode, 403);
        assert.strictEqual(res.body.success, false);
        assert.match(res.body.message, /Not authorized/i);
      } finally {
        Poll.findById = origFindById;
      }
    });
  });

  // --- 8. Discussion Integration: GetDiscussionById ---
  describe("Discussion Detail Integration (GET /api/circle/discussions/:id)", () => {
    it("should return discussion and populate linked poll when isPoll is true", async () => {
      const discussionId = new mongoose.Types.ObjectId();
      const pollId = new mongoose.Types.ObjectId();

      const mockDiscussion = {
        _id: discussionId,
        title: "Linked Poll Discussion",
        category: "DATING VIBE",
        isPoll: true,
        pollId: {
          _id: pollId,
          question: "Linked Poll Question",
          category: "DATING VIBE",
          totalVotes: 10,
        },
        createdBy: mockUser,
      };

      const origFindById = Discussion.findById;
      Discussion.findById = function () {
        return {
          populate: function () {
            return {
              populate: async () => mockDiscussion,
            };
          },
        };
      };

      try {
        const req = {
          params: { id: discussionId.toString() },
          user: mockUser,
        };
        const res = createMockRes();

        await discussionController.getDiscussionById(req, res);

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.body.success, true);
        assert.strictEqual(res.body.data.isPoll, true);
        assert.ok(res.body.data.pollId);
        assert.strictEqual(res.body.data.pollId.question, "Linked Poll Question");
      } finally {
        Discussion.findById = origFindById;
      }
    });
  });
});
