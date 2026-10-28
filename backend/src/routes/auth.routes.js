import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { config } from "../config.js";
import { requireAuth } from "../middleware/auth.js";
import { User } from "../models/user.model.js";
import { Teacher } from "../models/domain.models.js";
import { deliverPasswordReset } from "../services/credential-delivery.js";

export const authRouter = Router();

authRouter.post("/login", async (req, res, next) => {
  try {
    const email =
      typeof req.body.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";
    const password =
      typeof req.body.password === "string" ? req.body.password : "";
    if (!email || password.length < 8)
      return res
        .status(400)
        .json({ message: "A valid email and password are required" });
    const user = await User.findOne({ email, isActive: true }).select(
      "+passwordHash",
    );
    if (!user || !(await bcrypt.compare(password, user.passwordHash)))
      return res.status(401).json({ message: "Invalid email or password" });
    const session = {
      id: user.id,
      tenantId: user.tenantId.toString(),
      name: user.name,
      email: user.email,
      roles: user.roles,
      mustChangePassword: user.mustChangePassword,
    };
    const token = jwt.sign(session, config.sessionSecret, { expiresIn: "8h" });
    await User.updateOne(
      { _id: user._id },
      { $set: { lastLoginAt: new Date() } },
    );
    res.cookie("campus_session", token, {
      httpOnly: true,
      secure: config.nodeEnv === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 8 * 60 * 60 * 1000,
    });
    return res.json(session);
  } catch (error) {
    return next(error);
  }
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie("campus_session", { path: "/" });
  return res.json({ success: true });
});

authRouter.post("/change-password", requireAuth, async (req, res, next) => {
  try {
    const currentPassword = typeof req.body.currentPassword === "string" ? req.body.currentPassword : "";
    const newPassword = typeof req.body.newPassword === "string" ? req.body.newPassword : "";
    if (!currentPassword || newPassword.length < 10)
      return res.status(400).json({ message: "Current password and a new password of at least 10 characters are required" });
    const user = await User.findOne({ _id: req.user.id, tenantId: req.user.tenantId, isActive: true }).select("+passwordHash");
    if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash)))
      return res.status(401).json({ message: "Current password is incorrect" });
    if (await bcrypt.compare(newPassword, user.passwordHash))
      return res.status(400).json({ message: "New password must be different" });
    user.passwordHash = await bcrypt.hash(newPassword, 12);
    user.mustChangePassword = false;
    user.passwordResetTokenHash = undefined;
    user.passwordResetExpiresAt = undefined;
    await user.save();
    res.clearCookie("campus_session", { path: "/" });
    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

authRouter.get("/me", requireAuth, (req, res) => res.json(req.user));

authRouter.post("/forgot-password", async (req, res, next) => {
  try {
    const email =
      typeof req.body.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";
    const user = email ? await User.findOne({ email, isActive: true }) : null;
    if (user) {
      const token = crypto.randomBytes(32).toString("hex");
      const teacher = user.roles.includes("teacher") ? await Teacher.findOne({ tenantId: user.tenantId, userId: user._id }).select("phone").lean() : null;
      const delivery = await deliverPasswordReset({ name: user.name, email: user.email, phone: teacher?.phone, token });
      if (delivery.status === "delivered") {
        user.passwordResetTokenHash = crypto.createHash("sha256").update(token).digest("hex");
        user.passwordResetExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
        await user.save();
      }
    }
    return res.json({
      message:
        "If that account exists, password reset instructions have been sent.",
    });
  } catch (error) {
    return next(error);
  }
});

authRouter.post("/reset-password", async (req, res, next) => {
  try {
    const token = typeof req.body.token === "string" ? req.body.token : "";
    const password =
      typeof req.body.password === "string" ? req.body.password : "";
    if (!token || password.length < 10)
      return res
        .status(400)
        .json({
          message:
            "Token and a password of at least 10 characters are required",
        });
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({
      passwordResetTokenHash: hash,
      passwordResetExpiresAt: { $gt: new Date() },
    }).select("+passwordResetTokenHash +passwordResetExpiresAt");
    if (!user)
      return res
        .status(400)
        .json({ message: "Reset link is invalid or expired" });
    user.passwordHash = await bcrypt.hash(password, 12);
    user.passwordResetTokenHash = undefined;
    user.passwordResetExpiresAt = undefined;
    user.mustChangePassword = false;
    await user.save();
    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});
