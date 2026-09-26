// src/routes/auth.ts
import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { RoleName } from '@prisma/client';
import prisma from '../config/prisma.js';
import { config } from '../config/index.js';
import { registerSchema, loginSchema } from '../validation/auth.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';

const router = Router();

// Helper to format user data without passwordHash
const formatUser = (user: any) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role?.name ?? user.roleId,
});

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: 'Invalid input', errors: parsed.error.format() });
    }
    const { name, email, password, role } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();

    // Check for existing user
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }

    // Determine role – only ADMIN can assign privileged roles, otherwise default PLAYER
    let assignedRole = 'PLAYER';
    if (role && (req as any).auth?.role === 'ADMIN') {
      assignedRole = role;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = await prisma.user.create({
      data: {
        name,
        email: normalizedEmail,
        passwordHash,
        role: { connect: { name: assignedRole as RoleName } },
      },
      include: { role: true },
    });
    return res.status(201).json({ success: true, user: formatUser(newUser) });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: 'Invalid input', errors: parsed.error.format() });
    }
    const { email, password } = parsed.data;
    const normalizedEmail = email.trim().toLowerCase();

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail }, include: { role: true } });
    // Generic error to avoid account enumeration
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    const token = jwt.sign(
      { userId: user.id, role: user.role?.name },
      config.jwtSecret,
      { expiresIn: process.env.JWT_EXPIRES_IN ?? '1h' } as jwt.SignOptions
    );
    return res.json({ success: true, token, user: formatUser(user) });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).auth?.userId;
    const user = await prisma.user.findUnique({ where: { id: userId }, include: { role: true } });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    return res.json({ success: true, user: formatUser(user) });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/admin-test – protected admin route
router.get('/admin-test', authMiddleware, requireRole('ADMIN'), (req: Request, res: Response) => {
  res.json({ success: true, message: 'Admin access granted' });
});

export default router;
