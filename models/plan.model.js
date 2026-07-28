const mongoose = require('mongoose');

const planSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        enum: ['Silver', 'Gold', 'Platinum']
    },
    subtitle: {
        type: String,
        required: true
    },
    prices: {
        monthly: {
            type: Number,
            required: true
        },
        annual: {
            type: Number,
            required: true
        }
    },
    features: [
        {
            text: {
                type: String,
                required: true
            },
            included: {
                type: Boolean,
                default: true
            }
        }
    ],
    isPopular: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Plan', planSchema);