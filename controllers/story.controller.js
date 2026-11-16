const mongoose = require("mongoose");
const { Readable } = require("stream");

const Story = require("../models/story.model");
const StoryHighlight = require("../models/storyHighlight.model");
const User = require("../models/user.model");
const cloudinary = require("../config/cloudinary");

const {
  canAccessStory,
  emitToStoryAudience,
} = require("../utils/story.utils");

const ALLOWED_REACTIONS = ["🔥", "❤️", "😍", "🥂", "👏"];

// Safely emit Socket.IO events.
// Notification failures must not undo successful database operations.
const safelyEmitToStoryAudience = async (
  io,
  ownerId,
  event,
  payload,
  includeOwner = false
) => {
  try {
    await emitToStoryAudience(
      io,
      ownerId,
      event,
      payload,
      includeOwner
    );
  } catch (error) {
    console.error(`[Socket.IO] Failed to emit ${event}:`, error.message);
  }
};

// Upload an in-memory Multer file to Cloudinary.
const uploadToCloudinary = (file) =>
  new Promise((resolve, reject) => {
    const resourceType = file.mimetype.startsWith("video/")
      ? "video"
      : "image";

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: "bummps/stories",
        resource_type: resourceType,
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }

        resolve(result);
      }
    );

    Readable.from(file.buffer).pipe(uploadStream);
  });

// Check whether a Cloudinary asset is still referenced
// by any Story or permanent Highlight.
const isCloudinaryAssetInUse = async (publicId) => {
  if (!publicId) return false;

  const [storyExists, highlightExists] = await Promise.all([
    Story.exists({ mediaPublicId: publicId }),
    StoryHighlight.exists({ "stories.mediaPublicId": publicId }),
  ]);

  return Boolean(storyExists || highlightExists);
};

// Delete a Cloudinary asset only when no database document references it.
const deleteCloudinaryAssetIfUnused = async (publicId, resourceType) => {
  if (!publicId) return;

  const inUse = await isCloudinaryAssetInUse(publicId);

  if (inUse) {
    console.log(`[Cloudinary] Retaining referenced asset: ${publicId}`);
    return;
  }

  await cloudinary.uploader.destroy(publicId, {
    resource_type: resourceType,
  });
};

// ======================================================
// CREATE STORY
// POST /api/stories
// ======================================================

exports.createStory = async (req, res) => {
  let uploadedAsset;

  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Story media is required.",
      });
    }

    const caption =
      typeof req.body.caption === "string"
        ? req.body.caption.trim()
        : "";

    if (caption.length > 200) {
      return res.status(400).json({
        success: false,
        message: "Caption cannot exceed 200 characters.",
      });
    }

    let musicSticker = null;

    if (req.body.musicSticker) {
      try {
        musicSticker = JSON.parse(req.body.musicSticker);
      } catch {
        return res.status(400).json({
          success: false,
          message: "musicSticker must be valid JSON.",
        });
      }

      if (
        !musicSticker ||
        typeof musicSticker !== "object" ||
        Array.isArray(musicSticker)
      ) {
        return res.status(400).json({
          success: false,
          message: "musicSticker must be a JSON object.",
        });
      }

      if (
        !musicSticker.trackId ||
        !musicSticker.trackName ||
        !musicSticker.artistName
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Music sticker requires trackId, trackName and artistName.",
        });
      }

      if (
        musicSticker.stickerType &&
        !["card", "vinyl", "equalizer"].includes(
          musicSticker.stickerType
        )
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid music sticker type.",
        });
      }

      for (const position of ["positionX", "positionY"]) {
        if (
          musicSticker[position] !== undefined &&
          (typeof musicSticker[position] !== "number" ||
            !Number.isFinite(musicSticker[position]) ||
            musicSticker[position] < 0 ||
            musicSticker[position] > 1)
        ) {
          return res.status(400).json({
            success: false,
            message: `${position} must be between 0 and 1.`,
          });
        }
      }
    }

    uploadedAsset = await uploadToCloudinary(req.file);

    const story = await Story.create({
      userId: req.user._id,
      mediaUrl: uploadedAsset.secure_url,
      mediaPublicId: uploadedAsset.public_id,
      mediaType: req.file.mimetype.startsWith("video/")
        ? "video"
        : "image",
      caption,
      musicSticker,
    });

    // Notify eligible matches after MongoDB successfully saves the story.
    await safelyEmitToStoryAudience(
      req.app.get("io"),
      req.user._id,
      "story:new",
      {
        story: {
          _id: story._id,
          userId: req.user._id,
          userName: req.user.name,
          userAvatar: req.user.profilePic,
          mediaUrl: story.mediaUrl,
          mediaType: story.mediaType,
          caption: story.caption,
          musicSticker: story.musicSticker,
          createdAt: story.createdAt,
          expiresAt: story.expiresAt,
        },
      },
      true
    );

    return res.status(201).json({
      success: true,
      message: "Story created successfully.",
      story,
    });
  } catch (error) {
    // Clean up the Cloudinary upload if story creation failed.
    if (uploadedAsset?.public_id) {
      await cloudinary.uploader
        .destroy(uploadedAsset.public_id, {
          resource_type: uploadedAsset.resource_type,
        })
        .catch((cleanupError) => {
          console.error(
            "Cloudinary cleanup error:",
            cleanupError.message
          );
        });
    }

    console.error("Create story error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create story.",
    });
  }
};

// ======================================================
// GET STORY FEED
// GET /api/stories/feed
// ======================================================

exports.getStoryFeed = async (req, res) => {
  try {
    const currentUserId = req.user._id;

    const currentUser = await User.findById(currentUserId)
      .select("matches blockedUsers")
      .lean();

    if (!currentUser) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    // Only include reciprocal matches who have not blocked the current user.
    const mutualMatches = await User.find({
      _id: {
        $in: currentUser.matches || [],
        $nin: currentUser.blockedUsers || [],
      },
      matches: currentUserId,
      blockedUsers: { $ne: currentUserId },
    })
      .select("_id name profilePic")
      .lean();

    const allowedUsers = [
      {
        _id: currentUserId,
        name: req.user.name,
        profilePic: req.user.profilePic,
      },
      ...mutualMatches,
    ];

    const userIds = allowedUsers.map((user) => user._id);

    const stories = await Story.find({
      userId: { $in: userIds },
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: 1 });

    const userMap = new Map(
      allowedUsers.map((user) => [
        user._id.toString(),
        user,
      ])
    );

    const groupedStories = {};

    for (const story of stories) {
      const ownerId = story.userId.toString();
      const owner = userMap.get(ownerId);

      if (!owner) {
        continue;
      }

      if (!groupedStories[ownerId]) {
        groupedStories[ownerId] = {
          userId: owner._id,
          userName: owner.name,
          userAvatar: owner.profilePic,
          stories: [],
        };
      }

      groupedStories[ownerId].stories.push(story);
    }

    return res.status(200).json({
      success: true,
      count: Object.keys(groupedStories).length,
      feed: Object.values(groupedStories),
    });
  } catch (error) {
    console.error("Get story feed error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch story feed.",
    });
  }
};

// ======================================================
// VIEW STORY
// POST /api/stories/:id/view
// ======================================================

exports.viewStory = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid story ID.",
      });
    }

    const story = await Story.findOne({
      _id: id,
      expiresAt: { $gt: new Date() },
    });

    if (!story) {
      return res.status(404).json({
        success: false,
        message: "Story not found or expired.",
      });
    }

    const hasAccess = await canAccessStory(
      story.userId,
      req.user._id
    );

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to view this story.",
      });
    }

    if (story.userId.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot record a view on your own story.",
      });
    }

    const alreadyViewed = story.viewers.some(
      (viewer) =>
        viewer.userId?.toString() === req.user._id.toString()
    );

    if (!alreadyViewed) {
      const viewedAt = new Date();

      story.viewers.push({
        userId: req.user._id,
        viewedAt,
      });

      await story.save();

      // Notify the story owner through their private Socket.IO room.
      try {
        const io = req.app.get("io");
 
        if (io) {
          io.to(story.userId.toString()).emit("story:viewed", {
            storyId: story._id,
            viewer: {
              userId: req.user._id,
              name: req.user.name,
              profilePic: req.user.profilePic,
            },
            viewedAt,
            viewerCount: story.viewers.length,
          });
        }
      } catch (socketError) {
        console.error(
          "Story view socket notification failed:",
          socketError.message
        );
      }
    }

    return res.status(200).json({
      success: true,
      message: alreadyViewed
        ? "Story already viewed."
        : "Story view recorded.",
      viewerCount: story.viewers.length,
    });
  } catch (error) {
    console.error("View story error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to record story view.",
    });
  }
};

// ======================================================
// REACT TO STORY
// POST /api/stories/:id/react
// ======================================================

exports.reactToStory = async (req, res) => {
  try {
    const { id } = req.params;
    const { reactionType } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid story ID.",
      });
    }

    if (!ALLOWED_REACTIONS.includes(reactionType)) {
      return res.status(400).json({
        success: false,
        message: "Invalid reaction type.",
        allowedReactions: ALLOWED_REACTIONS,
      });
    }

    const story = await Story.findOne({
      _id: id,
      expiresAt: { $gt: new Date() },
    });

    if (!story) {
      return res.status(404).json({
        success: false,
        message: "Story not found or expired.",
      });
    }

    const hasAccess = await canAccessStory(
      story.userId,
      req.user._id
    );

    if (
      !hasAccess ||
      story.userId.toString() === req.user._id.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to react to this story.",
      });
    }

    const existingReaction = story.reactions.find(
      (reaction) =>
        reaction.userId?.toString() === req.user._id.toString()
    );

    let savedReaction;

    if (existingReaction) {
      existingReaction.reactionType = reactionType;
      existingReaction.createdAt = new Date();
      savedReaction = existingReaction;
    } else {
      story.reactions.push({
        userId: req.user._id,
        reactionType,
      });

      savedReaction = story.reactions[story.reactions.length - 1];
    }

    await story.save();

    // Notify the owner using the timestamp saved in MongoDB.
    try {
      const io = req.app.get("io");

      if (io) {
        io.to(story.userId.toString()).emit("story:reaction", {
          storyId: story._id,
          reaction: {
            userId: req.user._id,
            name: req.user.name,
            profilePic: req.user.profilePic,
            reactionType: savedReaction.reactionType,
            createdAt: savedReaction.createdAt,
          },
        });
      }
    } catch (socketError) {
      console.error(
        "Story reaction socket notification failed:",
        socketError.message
      );
    }

    return res.status(200).json({
      success: true,
      message: "Story reaction saved.",
      reactions: story.reactions,
    });
  } catch (error) {
    console.error("React to story error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to react to this story.",
    });
  }
};

// ======================================================
// DELETE STORY
// DELETE /api/stories/:id
// ======================================================

exports.deleteStory = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid story ID.",
      });
    }

    const story = await Story.findOne({
      _id: id,
      userId: req.user._id,
    });

    if (!story) {
      return res.status(404).json({
        success: false,
        message: "Story not found or you are not its owner.",
      });
    }

    const storyOwnerId = story.userId;
    const mediaPublicId = story.mediaPublicId;
    const resourceType =
      story.mediaType === "video" ? "video" : "image";

    // Delete the original Story document.
    await story.deleteOne();

    // Keep the Cloudinary asset if a Highlight still references it.
    if (mediaPublicId) {
      try {
        await deleteCloudinaryAssetIfUnused(
          mediaPublicId,
          resourceType
        );
      } catch (cloudinaryError) {
        console.error(
          "Cloudinary deletion error:",
          cloudinaryError.message
        );
      }
    }

    await safelyEmitToStoryAudience(
      req.app.get("io"),
      storyOwnerId,
      "story:deleted",
      {
        storyId: story.
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        
        _id,
        userId: storyOwnerId,
      },
      true
    );

    return res.status(200).json({
      success: true,
      message: "Story deleted successfully.",
    });
  } catch (error) {
    console.error("Delete story error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete story.",
    });
  }
};

// ======================================================
// GET USER HIGHLIGHTS
// GET /api/stories/highlights/:userId
// ======================================================

exports.getUserHighlights = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID.",
      });
    }

    const highlights = await StoryHighlight.find({ userId })
      .sort({ createdAt: -1 })
      .lean();

    const result = highlights.map((highlight) => {
    const stories = Array.isArray(highlight.stories)
      ? highlight.stories
      : [];

    return {
      ...highlight,
      stories,
      itemsCount: stories.length,
    };
  });

    return res.status(200).json({
      success: true,
      count: result.length,
      highlights: result,
    });
  } catch (error) {
    console.error("Get highlights error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch highlights.",
    });
  }
};

// ======================================================
// CREATE HIGHLIGHT
// POST /api/stories/highlights
// ======================================================

exports.createHighlight = async (req, res) => {
  try {
    const { title, coverUrl, storyIds } = req.body;

    if (
      typeof title !== "string" ||
      !title.trim() ||
      title.trim().length > 25
    ) {
      return res.status(400).json({
        success: false,
        message: "Title is required and must not exceed 25 characters.",
      });
    }

    if (
      typeof coverUrl !== "string" ||
      !coverUrl.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "coverUrl is required.",
      });
    }

    if (!Array.isArray(storyIds) || storyIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one story ID is required.",
      });
    }

    if (
      storyIds.some(
        (storyId) => !mongoose.isValidObjectId(storyId)
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "One or more story IDs are invalid.",
      });
    }

    const uniqueStoryIds = [
      ...new Set(storyIds.map(String)),
    ];

    // Fetch active Stories belonging to the authenticated user.
    const ownedStories = await Story.find({
      _id: { $in: uniqueStoryIds },
      userId: req.user._id,
      expiresAt: { $gt: new Date() },
    }).lean();

    if (ownedStories.length !== uniqueStoryIds.length) {
      return res.status(400).json({
        success: false,
        message: "All stories must be active stories owned by you.",
      });
    }

    // Preserve the order in which the user selected the Stories.
    const storiesById = new Map(
      ownedStories.map((story) => [
        story._id.toString(),
        story,
      ])
    );

    // Store permanent snapshots instead of Story references.
    const storySnapshots = uniqueStoryIds.map((storyId) => {
      const story = storiesById.get(storyId);

      return {
        originalStoryId: story._id,
        mediaUrl: story.mediaUrl,
        mediaPublicId: story.mediaPublicId || "",
        mediaType: story.mediaType,
        caption: story.caption || "",
        musicSticker: story.musicSticker || null,
        addedAt: new Date(),
      };
    });

    const highlight = await StoryHighlight.create({
      userId: req.user._id,
      title: title.trim(),
      coverUrl: coverUrl.trim(),
      stories: storySnapshots,
    });

    // Notify the owner's other connected devices.
    try {
      const io = req.app.get("io");

      if (io) {
        io.to(req.user._id.toString()).emit("highlight:created", {
          highlight,
        });
      }
    } catch (socketError) {
      console.error(
        "Highlight creation socket notification failed:",
        socketError.message
      );
    }

    return res.status(201).json({
      success: true,
      message: "Highlight created successfully.",
      highlight,
    });
  } catch (error) {
    console.error("Create highlight error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create highlight.",
    });
  }
};

// ======================================================
// DELETE HIGHLIGHT
// DELETE /api/stories/highlights/:id
// ======================================================

exports.deleteHighlight = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid highlight ID.",
      });
    }

    const highlight = await StoryHighlight.findOne({
      _id: id,
      userId: req.user._id,
    });

    if (!highlight) {
      return res.status(404).json({
        success: false,
        message: "Highlight not found or you are not its owner.",
      });
    }

    // Collect media references before deleting the Highlight.
    const assets = highlight.stories
      .filter((story) => story.mediaPublicId)
      .map((story) => ({
        publicId: story.mediaPublicId,
        resourceType:
          story.mediaType === "video" ? "video" : "image",
      }));

    await highlight.deleteOne();

    // Delete only assets that are no longer referenced anywhere.
    const uniqueAssets = [
      ...new Map(
        assets.map((asset) => [
          asset.publicId,
          asset,
        ])
      ).values(),
    ];

    for (const asset of uniqueAssets) {
      try {
        await deleteCloudinaryAssetIfUnused(
          asset.publicId,
          asset.resourceType
        );
      } catch (cloudinaryError) {
        console.error(
          `Cloudinary cleanup failed for ${asset.publicId}:`,
          cloudinaryError.message
        );
      }
    }

    // Notify the owner's other connected devices.
    try {
      const io = req.app.get("io");

      if (io) {
        io.to(req.user._id.toString()).emit("highlight:deleted", {
          highlightId: highlight._id,
          userId: req.user._id,
        });
      }
    } catch (socketError) {
      console.error(
        "Highlight deletion socket notification failed:",
        socketError.message
      );
    }

    return res.status(200).json({
      success: true,
      message: "Highlight deleted successfully.",
    });
  } catch (error) {
    console.error("Delete highlight error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete highlight.",
    });
  }
};