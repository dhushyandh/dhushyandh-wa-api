const env = require("./config/env");
const app = require("./app");
const connectDatabase = require("./config/database");
const logger = require("./utils/logger");
const { recoverStaleProcessingRecords } = require("./modules/webhook/message-processor");
const { seedInitialKnowledge } = require("./modules/knowledge/seed-data");
const {
  startReminderScheduler,
  stopReminderScheduler,
  recoverStaleReminders,
} = require("./modules/reminder/reminder.service");

let server;
let recoveryIntervalTimer;

const startServer = async () => {
  try {
    await connectDatabase();

    // Seed initial knowledge base (idempotent upsert)
    await seedInitialKnowledge();

    // Start background reminder scheduler
    startReminderScheduler();

    // Initial sweep to recover/unstick any stale records left from prior crashes
    await recoverStaleProcessingRecords();
    await recoverStaleReminders();

    // Periodic sweep for stale in-flight records
    const intervalMs = env.STALE_RECOVERY_INTERVAL_MS || 60000;
    recoveryIntervalTimer = setInterval(async () => {
      try {
        await recoverStaleProcessingRecords();
        await recoverStaleReminders();
      } catch (err) {
        logger.error("Periodic stale recovery error", { error: err.message });
      }
    }, intervalMs);

    if (typeof recoveryIntervalTimer.unref === "function") {
      recoveryIntervalTimer.unref();
    }

    server = app.listen(env.PORT, () => {
      logger.info("DHUSHYANDH AI API Server Started", {
        environment: env.NODE_ENV,
        port: env.PORT,
        url: `http://localhost:${env.PORT}`,
      });
    });
  } catch (error) {
    logger.error("Server startup failed", { error: error.message });
    process.exit(1);
  }
};

const shutdown = (signal) => {
  logger.info(`${signal} received. Initiating graceful shutdown...`);

  stopReminderScheduler();

  if (recoveryIntervalTimer) {
    clearInterval(recoveryIntervalTimer);
  }

  if (server) {
    server.close(async () => {
      try {
        const mongoose = require("mongoose");
        await mongoose.disconnect();
        logger.info("MongoDB disconnected. Shutdown complete.");
        process.exit(0);
      } catch (err) {
        logger.error("Error during database disconnection", { error: err.message });
        process.exit(1);
      }
    });
  } else {
    process.exit(0);
  }
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

startServer();
