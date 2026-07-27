const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);


    try {
      await conn.connection.collection('users').dropIndex('phone_1');
      console.log("✅ Fixed: Old 'phone_1' index deleted successfully!");
    } catch (err) {

    }

  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;