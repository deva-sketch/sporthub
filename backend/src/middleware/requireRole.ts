// src/middleware/requireRole.ts
import { Request, Response, NextFunction } from 'express';

type Role = 'ADMIN' | 'ORGANIZER' | 'TEAM_MANAGER' | 'PLAYER';

export const requireRole = (...allowedRoles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const auth = (req as any).auth;
    if (!auth) {
      return res.status(401).json({ success: false, message: 'Unauthenticated' });
    }
    if (!allowedRoles.includes(auth.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden: insufficient role' });
    }
    next();
  };
};
