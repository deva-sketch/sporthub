// src/routes/sports.ts
import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../config/prisma.js';
import { config } from '../config/index.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { createSportSchema, updateSportSchema } from '../validation/sports.js';
import createError from 'http-errors';

const router = Router();

// GET /api/sports - list all sports (any authorized role)
router.get('/', authMiddleware, requireRole('ADMIN', 'ORGANIZER', 'TEAM_MANAGER', 'PLAYER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sports = await prisma.sport.findMany();
    res.json({ success: true, data: sports });
  } catch (err) {
    next(err);
  }
});

// GET /api/sports/:id - get single sport
router.get('/:id', authMiddleware, requireRole('ADMIN', 'ORGANIZER', 'TEAM_MANAGER', 'PLAYER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sport = await prisma.sport.findUnique({ where: { id: req.params.id } });
    if (!sport) return next(createError(404, 'Sport not found'));
    res.json({ success: true, data: sport });
  } catch (err) {
    next(err);
  }
});

// POST /api/sports - create new sport (ADMIN only)
router.post('/', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = createSportSchema.safeParse(req.body);
    if (!parsed.success) return next(createError(400, 'Invalid input'));
    const { name, description } = parsed.data;
    // Unique name check
    const existing = await prisma.sport.findUnique({ where: { name } });
    if (existing) return next(createError(409, 'Sport name already exists'));
    const sport = await prisma.sport.create({ data: { name, description } });
    res.status(201).json({ success: true, data: sport });
  } catch (err) {
    next(err);
  }
});

// PUT /api/sports/:id - update sport (ADMIN only)
router.put('/:id', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = updateSportSchema.safeParse(req.body);
    if (!parsed.success) return next(createError(400, 'Invalid input'));
    const { name, description, active } = parsed.data;
    // If name is being changed, ensure uniqueness
    if (name) {
      const conflict = await prisma.sport.findUnique({ where: { name } });
      if (conflict && conflict.id !== req.params.id) return next(createError(409, 'Sport name already exists'));
    }
    const sport = await prisma.sport.update({
      where: { id: req.params.id },
      data: { name, description, ...(active !== undefined ? { active } : {}) },
    });
    res.json({ success: true, data: sport });
  } catch (err) {
    if ((err as any).code === 'P2025') return next(createError(404, 'Sport not found'));
    next(err);
  }
});

// DELETE /api/sports/:id - delete sport (ADMIN only, only if no tournaments)
router.delete('/:id', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sport = await prisma.sport.findUnique({ where: { id: req.params.id }, include: { tournaments: true } });
    if (!sport) return next(createError(404, 'Sport not found'));
    if (sport.tournaments && sport.tournaments.length > 0) {
      return next(createError(400, 'Cannot delete sport with existing tournaments'));
    }
    await prisma.sport.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Sport deleted' });
  } catch (err) {
    next(err);
  }
});

export default router;
