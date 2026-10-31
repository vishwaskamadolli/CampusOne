import "dotenv/config";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { pathToFileURL } from "node:url";
import { config } from "../config.js";
import { User } from "../models/user.model.js";

function adminSettings() {
  return {
    name: process.env.ADMIN_NAME?.trim(),
    email: process.env.ADMIN_EMAIL?.trim().toLowerCase(),
    password: process.env.ADMIN_PASSWORD,
    tenantId: process.env.ADMIN_TENANT_ID || "000000000000000000000001",
  };
}

function validateAdminSettings(admin) {
  const missing = [
    ["ADMIN_NAME", admin.name],
    ["ADMIN_EMAIL", admin.email],
    ["ADMIN_PASSWORD", admin.password],
  ].filter(([, value]) => !value).map(([key]) => key);

  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  if (!/^\S+@\S+\.\S+$/.test(admin.email)) throw new Error("ADMIN_EMAIL must be a valid email address");
  if (admin.password.length < 10) throw new Error("ADMIN_PASSWORD must contain at least 10 characters");
  if (!mongoose.isValidObjectId(admin.tenantId)) throw new Error("ADMIN_TENANT_ID must be a valid MongoDB ObjectId");
}

export async function seedAdmin(admin = adminSettings()) {
  validateAdminSettings(admin);

  const existing = await User.findOne({ email: admin.email }).lean();
  if (existing) return { created: false };

  await User.create({
    tenantId: new mongoose.Types.ObjectId(admin.tenantId),
    name: admin.name,
    email: admin.email,
    passwordHash: await bcrypt.hash(admin.password, 12),
    roles: ["admin"],
    isActive: true,
    mustChangePassword: false,
  });
  return { created: true };
}

async function run() {
  try {
    const admin = adminSettings();
    validateAdminSettings(admin);
    await mongoose.connect(config.mongoUri);
    const result = await seedAdmin(admin);
    console.log(result.created ? "Admin account created successfully" : "Admin account already exists; no changes made");
  } catch (error) {
    console.error(`Admin seed failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await run();
