const Swipe = require('../models/swipe.model');
const User = require('../models/user.model');


const superLikeUser = async (req, res) => {
    try {

        const userId = req.user.id;

        const { targetUserId } = req.body;


        // Cannot super like yourself
        if(userId.toString() === targetUserId){
            return res.status(400).json({
                message:"You cannot super like yourself"
            });
        }


        // Check target user exists
        const user = await User.findById(targetUserId);

        if(!user){
            return res.status(404).json({
                message:"User not found"
            });
        }


        // Already superliked check
        const alreadyLiked = await Swipe.findOne({
            fromUser:userId,
            toUser:targetUserId
        });


        if(alreadyLiked){
            return res.status(400).json({
                message:"Already swiped this user"
            });
        }


        const swipe = await Swipe.create({

            fromUser:userId,

            toUser:targetUserId,

            action:"superlike"

        });


        res.status(201).json({
            message:"Super Like sent successfully",
            swipe
        });


    } catch(error){

        res.status(500).json({
            message:error.message
        });

    }
};


module.exports = {
    superLikeUser
};