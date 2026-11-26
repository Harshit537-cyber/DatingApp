const mongoose = require("mongoose");
const Poll = require("../models/poll.model");
const PollVote = require("../models/pollVote.model");
const Discussion = require("../models/discussion.model");

const ALLOWED_CATEGORIES = [
  "DATING VIBE",
  "FIRST MOVES",
  "GREEN FLAGS",
  "RED FLAGS",
  "TRAVEL & ESCAPES",
  "NIGHTLIFE",
  "DATING ETIQUETTE",
  "WEEKEND RHYTHM",
  "UNFILTERED",
];

/**
 * Formats a poll document into the API contract with dynamic percentage math.
 * Percentages are never persisted in MongoDB.
 */
const formatPollResponse = (poll, userVote) => {
  const total = poll.totalVotes || 0;
  const options = (poll.options || []).map((opt) => {
    const count = opt.voteCount || 0;
    const percentage =
      total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0.0;
    return {
      optionIndex: opt.optionIndex,
      optionText: opt.optionText,
      voteCount: count,
      percentage,
    };
  });

  return {
    _id: poll._id,
    question: poll.question,
    category: poll.category,
    options,
    totalVotes: total,
    hasVoted: Boolean(userVote),
    userSelectedOptionIndex: userVote ? userVote.optionIndex : null,
    discussionId: poll.discussionId,
    status: poll.status,
    expiresAt: poll.expiresAt,
    createdAt: poll.createdAt,
    createdBy: poll.createdBy,
  };
};

/**
 * Executes a callback within a MongoDB transaction if replica set transactions
 * are supported by the deployment, otherwise falls back to normal execution with clean rollback.
 */
async function withOptionalTransaction(fn) {
  let session = null;
  let useTransaction = false;

  // Only attempt a session if Mongoose has an active live connection (readyState === 1)
  if (mongoose.connection && mongoose.connection.readyState === 1) {
    try {
      session = await mongoose.startSession();
      session.startTransaction();
      useTransaction = true;
    } catch {
      // Standalone instances without replica sets do not support transactions
      session = null;
      useTransaction = false;
    }
  }

  try {
    const result = await fn(session);
    if (useTransaction && session) {
      await session.commitTransaction();
    }
    return result;
  } catch (error) {
    if (useTransaction && session) {
      await session.abortTransaction();
    }
    throw error;
  } finally {
    if (session) {
      session.endSession();
    }
  }
}

/**
 * POST /api/circle/polls
 * Creates a community poll and automatically provisions a linked discussion in The Buzz.
 */
const createPoll = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    const { question, category, options, durationDays = 7 } = req.body;

    // 1. Validate question
    if (!question || typeof question !== "string" || !question.trim()) {
      return res.status(400).json({ success: false, message: "Poll question is required" });
    }
    const trimmedQuestion = question.trim();
    if (trimmedQuestion.length > 250) {
      return res.status(400).json({
        success: false,
        message: "Poll question cannot exceed 250 characters",
      });
    }

    // 2. Validate category
    const targetCategory = typeof category === "string" ? category.trim() : "DATING VIBE";
    if (!ALLOWED_CATEGORIES.includes(targetCategory)) {
      return res.status(400).json({
        success: false,
        message: `Invalid category. Must be one of: ${ALLOWED_CATEGORIES.join(", ")}`,
      });
    }

    // 3. Validate options (2 to 4 options required)
    if (!Array.isArray(options) || options.length < 2 || options.length > 4) {
      return res.status(400).json({
        success: false,
        message: "A poll must have between 2 and 4 options",
      });
    }

    const formattedOptions = [];
    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      if (typeof opt !== "string" || !opt.trim()) {
        return res.status(400).json({
          success: false,
          message: `Option at index ${i} cannot be empty`,
        });
      }
      const trimmedOpt = opt.trim();
      if (trimmedOpt.length > 100) {
        return res.status(400).json({
          success: false,
          message: `Option at index ${i} cannot exceed 100 characters`,
        });
      }
      formattedOptions.push({
        optionIndex: i,
        optionText: trimmedOpt,
        voteCount: 0,
      });
    }

    // 4. Validate durationDays
    const parsedDays = Number(durationDays);
    if (!Number.isInteger(parsedDays) || parsedDays <= 0 || parsedDays > 365) {
      return res.status(400).json({
        success: false,
        message: "durationDays must be a positive integer between 1 and 365",
      });
    }
    const expiresAt = new Date(Date.now() + parsedDays * 24 * 60 * 60 * 1000);

    // 5. Atomic execution: Poll + Discussion auto-creation
    const { newPoll, newDiscussion } = await withOptionalTransaction(async (session) => {
      const pollDoc = new Poll({
        createdBy: userId,
        question: trimmedQuestion,
        category: targetCategory,
        options: formattedOptions,
        totalVotes: 0,
        expiresAt,
        status: "active",
      });
      await pollDoc.save({ session });

      const discussionDoc = new Discussion({
        createdBy: userId,
        title: trimmedQuestion,
        subtitle: "Cast your vote in the community poll and share your thoughts below!",
        category: targetCategory,
        repliesCount: 0,
        pollId: pollDoc._id,
        isPoll: true,
      });
      await discussionDoc.save({ session });

      pollDoc.discussionId = discussionDoc._id;
      await pollDoc.save({ session });

      return { newPoll: pollDoc, newDiscussion: discussionDoc };
    });

    return res.status(201).json({
      success: true,
      message: "Poll and discussion created successfully",
      data: {
        poll: formatPollResponse(newPoll, null),
        discussion: {
          _id: newDiscussion._id,
          title: newDiscussion.title,
          subtitle: newDiscussion.subtitle,
          category: newDiscussion.category,
          repliesCount: newDiscussion.repliesCount,
          pollId: newPoll._id,
          isPoll: true,
        },
      },
    });
  } catch (error) {
    console.error("[PollController] createPoll error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/circle/polls
 * Retrieves a paginated feed of community polls with dynamic percentage calculations
 * and batch-resolved voting states.
 */
const getPolls = async (req, res) => {
  try {
    const userId = req.user?._id;
    const { category, status = "active", page = 1, limit = 10 } = req.query;

    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.max(1, Math.min(parseInt(limit, 10) || 10, 50));
    const skip = (parsedPage - 1) * parsedLimit;

    const filter = {};
    if (status && (status === "active" || status === "closed")) {
      filter.status = status;
    }
    if (category && typeof category === "string" && category.trim()) {
      filter.category = category.trim();
    }

    const [polls, total] = await Promise.all([
      Poll.find(filter)
        .populate("createdBy", "name profilePic")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parsedLimit),
      Poll.countDocuments(filter),
    ]);

    // Batch resolve user votes for all returned polls (prevents N+1 queries)
    let voteMap = new Map();
    if (userId && polls.length > 0) {
      const pollIds = polls.map((p) => p._id);
      const userVotes = await PollVote.find({
        pollId: { $in: pollIds },
        userId,
      });
      voteMap = new Map(userVotes.map((v) => [v.pollId.toString(), v]));
    }

    const formattedPolls = polls.map((p) =>
      formatPollResponse(p, voteMap.get(p._id.toString()))
    );

    return res.status(200).json({
      success: true,
      data: {
        polls: formattedPolls,
        pagination: {
          total,
          page: parsedPage,
          pages: Math.ceil(total / parsedLimit) || 1,
        },
      },
    });
  } catch (error) {
    console.error("[PollController] getPolls error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/circle/polls/:id
 * Retrieves complete details for a single poll including percentages and user vote state.
 */
const getPollById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ success: false, message: "Poll not found" });
    }

    const poll = await Poll.findById(id).populate("createdBy", "name profilePic");
    if (!poll) {
      return res.status(404).json({ success: false, message: "Poll not found" });
    }

    const userId = req.user?._id;
    const userVote = userId
      ? await PollVote.findOne({ pollId: poll._id, userId })
      : null;

    return res.status(200).json({
      success: true,
      data: formatPollResponse(poll, userVote),
    });
  } catch (error) {
    console.error("[PollController] getPollById error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/circle/polls/:id/vote
 * Records a user's vote with atomic duplicate prevention and updates counts transaction-safely.
 */
const votePoll = async (req, res) => {
  try {
    const { id: pollId } = req.params;
    const { optionIndex } = req.body;
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({ success: false, message: "User not authenticated" });
    }

    if (!mongoose.Types.ObjectId.isValid(pollId)) {
      return res.status(404).json({ success: false, message: "Poll not found" });
    }

    const parsedOptionIndex = Number(optionIndex);
    if (!Number.isInteger(parsedOptionIndex)) {
      return res.status(400).json({
        success: false,
        message: "Valid optionIndex integer is required",
      });
    }

    const poll = await Poll.findById(pollId);
    if (!poll) {
      return res.status(404).json({ success: false, message: "Poll not found" });
    }

    // Check poll status and expiry
    const isExpired = poll.expiresAt && new Date() > new Date(poll.expiresAt);
    if (poll.status !== "active" || isExpired) {
      return res.status(410).json({
        success: false,
        message: "This poll is closed or has expired",
      });
    }

    // Verify option exists within poll
    const selectedOption = poll.options.find(
      (o) => o.optionIndex === parsedOptionIndex
    );
    if (!selectedOption) {
      return res.status(400).json({
        success: false,
        message: "Invalid option selected",
      });
    }

    // Execute atomic voting with duplicate protection
    const updatedPoll = await withOptionalTransaction(async (session) => {
      // Step A: Insert PollVote record (Compound unique index { pollId: 1, userId: 1 } blocks duplicates)
      try {
        if (session) {
          await PollVote.create(
            [{ pollId, userId, optionIndex: parsedOptionIndex }],
            { session }
          );
        } else {
          await PollVote.create({
            pollId,
            userId,
            optionIndex: parsedOptionIndex,
          });
        }
      } catch (err) {
        if (err.code === 11000) {
          const conflictErr = new Error("You have already voted on this poll");
          conflictErr.status = 409;
          throw conflictErr;
        }
        throw err;
      }

      // Step B: Atomically increment option voteCount and totalVotes
      const query = {
        _id: pollId,
        status: "active",
        expiresAt: { $gt: new Date() },
        "options.optionIndex": parsedOptionIndex,
      };

      const update = {
        $inc: {
          "options.$.voteCount": 1,
          totalVotes: 1,
        },
      };

      const optionsConfig = { new: true };
      if (session) optionsConfig.session = session;

      const updated = await Poll.findOneAndUpdate(query, update, optionsConfig).populate(
        "createdBy",
        "name profilePic"
      );

      if (!updated) {
        const expiredErr = new Error("This poll is closed or has expired");
        expiredErr.status = 410;
        throw expiredErr;
      }

      return updated;
    });

    const userVote = { optionIndex: parsedOptionIndex };
    return res.status(200).json({
      success: true,
      message: "Vote recorded successfully",
      data: formatPollResponse(updatedPoll, userVote),
    });
  } catch (error) {
    if (error.status === 409 || error.status === 410) {
      return res.status(error.status).json({ success: false, message: error.message });
    }
    console.error("[PollController] votePoll error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * DELETE /api/circle/polls/:id
 * Deletes a poll, removes associated votes, and safely handles the linked Buzz discussion.
 * Authorized for Poll Creator or Administrator.
 */
const deletePoll = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ success: false, message: "Poll not found" });
    }

    const poll = await Poll.findById(id);
    if (!poll) {
      return res.status(404).json({ success: false, message: "Poll not found" });
    }

    // Authorization: Owner or Admin
    const isOwner =
      req.user && poll.createdBy && poll.createdBy.toString() === req.user._id.toString();
    const isAdmin = Boolean(
      req.admin ||
      req.user?.role === "admin" ||
      req.user?.role === "superadmin"
    );

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this poll",
      });
    }

    await withOptionalTransaction(async (session) => {
      // 1. Remove corresponding votes
      const voteQuery = { pollId: poll._id };
      if (session) {
        await PollVote.deleteMany(voteQuery, { session });
      } else {
        await PollVote.deleteMany(voteQuery);
      }

      // 2. Safely handle linked discussion
      if (poll.discussionId) {
        const linkedDiscussion = await Discussion.findById(poll.discussionId);
        if (linkedDiscussion) {
          // If no replies, clean it up completely; if it has community replies, disassociate it
          if (linkedDiscussion.repliesCount === 0) {
            if (session) {
              await Discussion.findByIdAndDelete(poll.discussionId, { session });
            } else {
              await Discussion.findByIdAndDelete(poll.discussionId);
            }
          } else {
            linkedDiscussion.pollId = null;
            linkedDiscussion.isPoll = false;
            await linkedDiscussion.save({ session });
          }
        }
      }

      // 3. Delete Poll
      if (session) {
        await Poll.findByIdAndDelete(poll._id, { session });
      } else {
        await Poll.findByIdAndDelete(poll._id);
      }
    });

    return res.status(200).json({
      success: true,
      message: "Poll deleted successfully",
    });
  } catch (error) {
    console.error("[PollController] deletePoll error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  createPoll,
  getPolls,
  getPollById,
  votePoll,
  deletePoll,
  formatPollResponse,
};
