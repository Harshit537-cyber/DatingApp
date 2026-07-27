const mongoose = require('mongoose');

const swipeSchema = new mongoose.Schema({

    fromUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    toUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    action: {
        type: String,
        enum: [
            "like",
            "dislike",
            "superlike"
        ],
        required: true
    }

}, {
    timestamps: true
});


module.exports = mongoose.model("Swipe", swipeSchema);