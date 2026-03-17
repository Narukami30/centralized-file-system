const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const defaultMongoUri = "mongodb://127.0.0.1:27017/centralize_file_system";
    const mongoUri = process.env.MONGO_URI || defaultMongoUri;
    const isUsingDefaultMongoUri = !process.env.MONGO_URI;

    if (process.env.NODE_ENV === "production" && isUsingDefaultMongoUri) {
      throw new Error("MONGO_URI is required in production");
    }

    await mongoose.connect(mongoUri);

    if (isUsingDefaultMongoUri) {
      console.warn("⚠️ Using default local MongoDB URI. Set MONGO_URI in environment for non-local deployments.");
    }

    console.log("✅ MongoDB connected successfully");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
