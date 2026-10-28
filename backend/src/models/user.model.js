import mongoose from "mongoose";

export const ROLES = ["admin", "teacher", "parent"];

const userSchema = new mongoose.Schema(
  {
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    passwordHash: { type: String, required: true, select: false },
    roles: [{ type: String, enum: ROLES, required: true }],
    isActive: { type: Boolean, default: true },
    passwordResetTokenHash: { type: String, select: false },
    passwordResetExpiresAt: { type: Date, select: false },
    mustChangePassword: { type: Boolean, default: false },
    credentialDeliveryStatus: { type: String, enum: ["pending", "delivered", "failed"], default: "pending" },
    credentialDeliveryChannel: { type: String, enum: ["email", "sms"] },
    credentialDeliveryLastAttemptAt: Date,
    credentialDeliveredAt: Date,
    lastLoginAt: Date,
  },
  { timestamps: true },
);

userSchema.index({ tenantId: 1, email: 1 }, { unique: true });
export const User = mongoose.model("User", userSchema);
