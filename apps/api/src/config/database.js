const mongoose = require("mongoose");
const env = require("./env");
const logger = require("../utils/logger");

let listenersRegistered = false;

function setupConnectionListeners() {
  if (listenersRegistered) return;
  listenersRegistered = true;

  mongoose.connection.on("connected", () => {
    const host = mongoose.connection.host || "remote-cluster";
    const port = mongoose.connection.port || "27017";
    const dbName = mongoose.connection.name || "test";

    logger.info("MongoDB connected successfully", {
      database: dbName,
      host,
      port,
      readyState: mongoose.connection.readyState,
    });
  });

  mongoose.connection.on("disconnected", () => {
    logger.warn("MongoDB connection disconnected; connection pool lost. Retrying...", {
      readyState: mongoose.connection.readyState,
    });
  });

  mongoose.connection.on("reconnected", () => {
    logger.info("MongoDB connection reconnected successfully", {
      database: mongoose.connection.name || "test",
      readyState: mongoose.connection.readyState,
    });
  });

  mongoose.connection.on("error", (err) => {
    logger.error("MongoDB connection runtime error", {
      error: err.message,
      name: err.name,
      readyState: mongoose.connection.readyState,
    });
  });
}

const connectDatabase = async () => {
  setupConnectionListeners();

  try {
    await mongoose.connect(env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
    });
  } catch (error) {
    logger.error("MongoDB initial connection failed", {
      error: error.message,
      name: error.name,
    });
    throw error;
  }
};

module.exports = connectDatabase;
