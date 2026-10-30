#!/usr/bin/env node

/**
 * DHUSHYANDH AI — Secure Automated MongoDB Backup Utility
 *
 * Requirements:
 * - Uses mongodump (native or via official Docker image mongo:latest)
 * - Safe credential handling: never logs connection string or credentials
 * - Stores backups outside Git repository (default: %USERPROFILE%/mongodb-backups/dhushyandh-ai)
 * - Timestamped backup directories: never overwrites existing backups
 * - Verifies backup output is non-empty and counts collections
 * - Configurable retention policy (default: 14 days)
 * - Documents restoration command with mongorestore
 */

const fs = require("fs");
const path = require("path");
const { execSync, spawnSync } = require("child_process");
const env = require("../apps/api/src/config/env");

const SENSITIVE_PATTERNS = [
  /mongodb(?:\+srv)?:\/\/[^\s"']+/gi,
  /:[^@:\/\s]+@/g, // password in URI
];

function redact(text) {
  if (!text || typeof text !== "string") return text;
  let out = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    out = out.replace(pattern, "[REDACTED_CREDENTIALS]");
  }
  return out;
}

function getTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = now.getFullYear();
  const mm = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const hh = pad(now.getHours());
  const min = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  return `${yyyy}-${mm}-${dd}_${hh}${min}${ss}`;
}

function checkNativeMongodump() {
  try {
    const res = spawnSync("mongodump", ["--version"], { stdio: "pipe", shell: true });
    return res.status === 0;
  } catch {
    return false;
  }
}

function checkDockerMongodump() {
  try {
    const res = spawnSync("docker", ["run", "--rm", "mongo:latest", "mongodump", "--version"], {
      stdio: "pipe",
      shell: true,
    });
    return res.status === 0;
  } catch {
    return false;
  }
}

function getDirectorySize(dirPath) {
  let totalBytes = 0;
  let fileCount = 0;

  function traverse(current) {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        traverse(fullPath);
      } else if (entry.isFile()) {
        totalBytes += fs.statSync(fullPath).size;
        fileCount++;
      }
    }
  }

  traverse(dirPath);
  return { totalBytes, fileCount };
}

function pruneOldBackups(backupRootDir, retentionDays = 14) {
  const maxAgeMs = retentionDays * 24 * 60 * 60 * 1000;
  const now = Date.now();
  let prunedCount = 0;

  if (!fs.existsSync(backupRootDir)) return 0;

  const entries = fs.readdirSync(backupRootDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.startsWith("backup_")) {
      const dirPath = path.join(backupRootDir, entry.name);
      const stats = fs.statSync(dirPath);
      if (now - stats.mtimeMs > maxAgeMs) {
        fs.rmSync(dirPath, { recursive: true, force: true });
        prunedCount++;
        console.log(`[RETENTION] Pruned backup older than ${retentionDays} days: ${entry.name}`);
      }
    }
  }

  return prunedCount;
}

async function runBackup({
  targetDir = null,
  retentionDays = 14,
} = {}) {
  const startTime = Date.now();
  console.log("=== DHUSHYANDH AI: Secure Database Backup Utility ===");

  if (!env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not configured in apps/api/.env");
  }

  // Determine backup destination (strictly outside Git repository by default)
  const userHome = process.env.USERPROFILE || process.env.HOME || "C:\\Users\\mn528";
  const defaultBackupRoot = path.resolve(userHome, "mongodb-backups", "dhushyandh-ai");
  const backupRoot = targetDir ? path.resolve(targetDir) : (process.env.BACKUP_ROOT_DIR || defaultBackupRoot);

  const timestamp = getTimestamp();
  const backupFolder = `backup_${timestamp}`;
  const destinationPath = path.join(backupRoot, backupFolder);

  if (fs.existsSync(destinationPath)) {
    throw new Error(`Backup destination already exists: ${destinationPath}. Will not overwrite.`);
  }

  fs.mkdirSync(destinationPath, { recursive: true });

  console.log(`[INFO] Backup Root Directory: ${backupRoot}`);
  console.log(`[INFO] Backup Target Folder: ${backupFolder}`);
  console.log(`[INFO] Retention Policy: ${retentionDays} days`);

  // Check mongodump availability
  const hasNative = checkNativeMongodump();
  const hasDocker = !hasNative && checkDockerMongodump();

  if (!hasNative && !hasDocker) {
    throw new Error(
      "mongodump is not installed locally and Docker mongo:latest is not available. Please install mongodb-database-tools or ensure Docker is running."
    );
  }

  console.log(`[INFO] mongodump engine: ${hasNative ? "Native Binary" : "Docker Container (mongo:latest)"}`);

  let dumpResult;

  if (hasNative) {
    // Native mongodump execution
    dumpResult = spawnSync(
      "mongodump",
      [
        `--uri=${env.MONGODB_URI}`,
        "--gzip",
        `--out=${destinationPath}`,
      ],
      { stdio: "pipe", shell: true }
    );
  } else {
    // Dockerized mongodump execution
    // Mount the destination folder into /backup
    const dockerMountPath = destinationPath.replace(/\\/g, "/");
    dumpResult = spawnSync(
      "docker",
      [
        "run",
        "--rm",
        "-v",
        `${destinationPath}:/backup_target`,
        "mongo:latest",
        "mongodump",
        `--uri=${env.MONGODB_URI}`,
        "--gzip",
        "--out=/backup_target",
      ],
      { stdio: "pipe", shell: true }
    );
  }

  if (dumpResult.status !== 0) {
    const errorOutput = redact((dumpResult.stderr || dumpResult.stdout || "").toString());
    fs.rmSync(destinationPath, { recursive: true, force: true });
    throw new Error(`mongodump execution failed with code ${dumpResult.status}: ${errorOutput}`);
  }

  // Validate backup completion and non-empty output
  const { totalBytes, fileCount } = getDirectorySize(destinationPath);

  if (fileCount === 0 || totalBytes === 0) {
    fs.rmSync(destinationPath, { recursive: true, force: true });
    throw new Error("Backup validation failed: dumped directory is completely empty.");
  }

  // Count dumped collections
  const dumpedDatabases = fs.readdirSync(destinationPath, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  let totalCollections = 0;
  for (const dbName of dumpedDatabases) {
    const dbDir = path.join(destinationPath, dbName);
    const bsongzFiles = fs.readdirSync(dbDir).filter((f) => f.endsWith(".bson.gz"));
    totalCollections += bsongzFiles.length;
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  const sizeMb = (totalBytes / (1024 * 1024)).toFixed(2);

  // Apply retention policy
  const pruned = pruneOldBackups(backupRoot, retentionDays);

  console.log("\n========================================================");
  console.log("✅ DATABASE BACKUP COMPLETED & VERIFIED SUCCESSFULLY");
  console.log("========================================================");
  console.log(`• Destination: ${destinationPath}`);
  console.log(`• Total Databases: ${dumpedDatabases.join(", ")}`);
  console.log(`• Total Collections: ${totalCollections}`);
  console.log(`• Total Archive Files: ${fileCount}`);
  console.log(`• Total Backup Size: ${sizeMb} MB (${totalBytes} bytes)`);
  console.log(`• Execution Duration: ${durationSec} seconds`);
  console.log(`• Pruned Backups: ${pruned}`);
  console.log("========================================================");
  console.log("\n========================================================");
  console.log("📖 SAFE TEST RESTORATION PROCEDURE (NON-DESTRUCTIVE):");
  console.log("To verify this backup safely in a sandbox database without touching production:");
  console.log(`mongorestore --uri="<MONGODB_URI>" --gzip --nsInclude="test.*" --nsRename="test.*:test_restore_verify.*" --dir="${destinationPath}"`);
  console.log("Or via Docker sandbox restore:");
  console.log(`docker run --rm -v "${destinationPath}:/backup_target" mongo:latest mongorestore --uri="<MONGODB_URI>" --gzip --nsInclude="test.*" --nsRename="test.*:test_restore_verify.*" --dir=/backup_target`);
  console.log("\n⚠️ DISASTER RECOVERY PRODUCTION RESTORE (OVERWRITE):");
  console.log(`mongorestore --uri="<MONGODB_URI>" --gzip --drop --dir="${destinationPath}"`);
  console.log("========================================================\n");

  return {
    success: true,
    destinationPath,
    totalBytes,
    fileCount,
    totalCollections,
    durationSec,
  };
}

if (require.main === module) {
  runBackup().catch((err) => {
    console.error(`[FATAL] Backup failed: ${redact(err.message)}`);
    process.exit(1);
  });
}

module.exports = { runBackup, redact, pruneOldBackups, getDirectorySize };
