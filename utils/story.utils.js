const User = require("../models/user.model");

/**
 * Get the users who are allowed to see a particular user's stories.
 *
 * Access rules:
 * 1. Both users must have matched each other.
 * 2. The story owner must not have blocked the viewer.
 * 3. The viewer must not have blocked the story owner.
 */
const getStoryAudience = async (ownerId) => {
  const owner = await User.findById(ownerId)
    .select("matches blockedUsers")
    .lean();

  if (!owner) {
    throw new Error("Story owner not found.");
  }

  const mutualMatches = await User.find({
    // The viewer must be in the owner's matches.
    _id: {
      $in: owner.matches || [],
      $nin: owner.blockedUsers || [],
    },

    // The owner must also be in the viewer's matches.
    matches: ownerId,

    // The viewer must not have blocked the owner.
    blockedUsers: { $ne: ownerId },
  })
    .select("_id")
    .lean();

  return mutualMatches.map((user) => user._id);
};

/**
 * Check whether a user can access another user's story.
 */
const canAccessStory = async (storyOwnerId, viewerId) => {
  // Users can always access their own stories.
  // The controller separately prevents self-views and self-reactions.
  if (storyOwnerId.toString() === viewerId.toString()) {
    return true;
  }

  const audience = await getStoryAudience(storyOwnerId);

  return audience.some(
    (userId) => userId.toString() === viewerId.toString()
  );
};

/**
 * Emit a Socket.IO event to all eligible mutual matches.
 *
 * If includeOwner is true, the story owner's other connected
 * devices also receive the event.
 */
const emitToStoryAudience = async (
  io,
  ownerId,
  event,
  payload,
  includeOwner = false
) => {
  if (!io) {
    throw new Error("Socket.IO server is unavailable.");
  }

  const audienceIds = await getStoryAudience(ownerId);

  const roomIds = audienceIds.map((userId) => userId.toString());

  if (includeOwner) {
    roomIds.push(ownerId.toString());
  }

  // Remove duplicate room IDs.
  const uniqueRoomIds = [...new Set(roomIds)];

  if (uniqueRoomIds.length === 0) {
    return;
  }

  // Each user has a private Socket.IO room named after their user ID.
  io.to(uniqueRoomIds).emit(event, payload);
};

module.exports = {
  getStoryAudience,
  canAccessStory,
  emitToStoryAudience,
};