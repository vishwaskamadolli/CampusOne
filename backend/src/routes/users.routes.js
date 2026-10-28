import { Router } from "express";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { allowRoles, requireAuth, requireTenant } from "../middleware/auth.js";
import { AuditLog } from "../models/audit-log.model.js";
import { ROLES, User } from "../models/user.model.js";

export const usersRouter = Router();
usersRouter.use(requireAuth, requireTenant, allowRoles("admin"));

usersRouter.get("/", async (req, res, next) => {
  try {
    const users = await User.find({ tenantId: req.tenantId })
      .select(
        "name email roles isActive mustChangePassword lastLoginAt createdAt",
      )
      .sort({ createdAt: -1 })
      .lean();
    return res.json(users);
  } catch (error) {
    return next(error);
  }
});

usersRouter.post("/", async (req, res, next) => {
  try {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const email =
      typeof req.body.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";
    const roles = Array.isArray(req.body.roles)
      ? [...new Set(req.body.roles)]
      : [];
    const password =
      typeof req.body.password === "string" ? req.body.password : "";
    if (
      !name ||
      !/^\S+@\S+\.\S+$/.test(email) ||
      password.length < 10 ||
      !roles.length ||
      roles.some((role) => !ROLES.includes(role) || role === "admin")
    )
      return res
        .status(400)
        .json({
          message: "Valid name, email, role, and a password of at least 10 characters are required",
        });
    if (await User.exists({ tenantId: req.tenantId, email }))
      return res
        .status(409)
        .json({ message: "An account with this email already exists" });
    const user = await User.create({
      tenantId: new mongoose.Types.ObjectId(req.tenantId),
      name,
      email,
      roles,
      passwordHash: await bcrypt.hash(password, 12),
      mustChangePassword: false,
    });
    await AuditLog.create({
      tenantId: req.tenantId,
      actorId: req.user.id,
      action: "user.created",
      entityType: "User",
      entityId: user._id,
      metadata: { email, roles },
      ipAddress: req.ip,
    });
    return res.status(201).json({
      user: { id: user.id, name, email, roles, isActive: true },
    });
  } catch (error) {
    return next(error);
  }
});

usersRouter.patch("/:id/status", async (req, res, next) => {
  try {
    if (
      !mongoose.isValidObjectId(req.params.id) ||
      typeof req.body.isActive !== "boolean"
    )
      return res
        .status(400)
        .json({ message: "Valid user and status are required" });
    const user = await User.findOneAndUpdate(
      {
        _id: req.params.id,
        tenantId: req.tenantId,
        roles: { $nin: ["admin"] },
      },
      { $set: { isActive: req.body.isActive } },
      { new: true },
    ).select("name email roles isActive");
    if (!user) return res.status(404).json({ message: "User not found" });
    await AuditLog.create({
      tenantId: req.tenantId,
      actorId: req.user.id,
      action: req.body.isActive ? "user.activated" : "user.deactivated",
      entityType: "User",
      entityId: user._id,
      ipAddress: req.ip,
    });
    return res.json(user);
  } catch (error) {
    return next(error);
  }
});
