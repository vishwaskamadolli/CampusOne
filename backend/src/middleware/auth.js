import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export function requireAuth(req, res, next) {
  const token = req.cookies.campus_session;
  if (!token) return res.status(401).json({ message: 'Authentication required' });
  try {
    req.user = jwt.verify(token, config.sessionSecret);
    const passwordChangeAllowed = req.originalUrl.endsWith('/auth/me') || req.originalUrl.endsWith('/auth/change-password') || req.originalUrl.endsWith('/auth/logout');
    if (req.user.mustChangePassword && !passwordChangeAllowed)
      return res.status(403).json({ message: 'Password change required before continuing' });
    return next();
  } catch {
    return res.status(401).json({ message: 'Session expired or invalid' });
  }
}

export function requireTenant(req, res, next) {
  if (!req.user?.tenantId) return res.status(403).json({ message: 'Tenant access is required' });
  req.tenantId = req.user.tenantId;
  return next();
}

export function allowRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user?.roles?.some((role) => allowedRoles.includes(role))) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }
    return next();
  };
}
