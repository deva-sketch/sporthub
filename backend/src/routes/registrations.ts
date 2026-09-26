// src/routes/registrations.ts
import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../config/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import createError from 'http-errors';

const router = Router();

export const registrationSelect = {
  id: true,
  tournamentId: true,
  teamId: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  tournament: {
    select: {
      id: true,
      name: true,
      status: true,
      sportId: true,
      organizerId: true,
      sport: { select: { id: true, name: true } },
      organizer: { select: { id: true, name: true, email: true } },
    },
  },
  team: {
    select: {
      id: true,
      name: true,
      shortName: true,
      sportId: true,
      managerId: true,
      sport: { select: { id: true, name: true } },
      manager: { select: { id: true, name: true, email: true } },
    },
  },
} as const;

// ─── GET /api/registrations/:id ───────────────────────────────────────────────
router.get(
  '/:id',
  authMiddleware,
  requireRole('ADMIN', 'ORGANIZER', 'TEAM_MANAGER', 'PLAYER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const reg = await prisma.tournamentTeamRegistration.findUnique({
        where: { id: req.params.id },
        select: registrationSelect,
      });

      if (!reg) return next(createError(404, 'Registration not found'));

      // Check permissions
      if (auth.role === 'ADMIN') {
        return res.json({ success: true, data: reg });
      }

      if (auth.role === 'ORGANIZER') {
        if (reg.tournament.organizerId !== auth.userId) {
          return next(createError(403, 'Forbidden: not your tournament registration'));
        }
        return res.json({ success: true, data: reg });
      }

      if (auth.role === 'TEAM_MANAGER') {
        if (reg.team.managerId !== auth.userId) {
          return next(createError(403, 'Forbidden: not your team registration'));
        }
        return res.json({ success: true, data: reg });
      }

      if (auth.role === 'PLAYER') {
        // Player must belong to the registered team
        const membership = await prisma.teamMembership.findFirst({
          where: {
            teamId: reg.teamId,
            player: { userId: auth.userId },
          },
        });
        if (!membership) {
          return next(createError(403, 'Forbidden: not a member of the registered team'));
        }
        return res.json({ success: true, data: reg });
      }

      return next(createError(403, 'Forbidden'));
    } catch (err) {
      next(err);
    }
  }
);

// ─── PUT /api/registrations/:id/approve ───────────────────────────────────────
router.put(
  '/:id/approve',
  authMiddleware,
  requireRole('ADMIN', 'ORGANIZER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const regId = req.params.id;

      const reg = await prisma.tournamentTeamRegistration.findUnique({
        where: { id: regId },
        include: { tournament: { select: { organizerId: true } } },
      });

      if (!reg) return next(createError(404, 'Registration not found'));

      // ORGANIZER ownership rule: must organize the tournament
      if (auth.role === 'ORGANIZER' && reg.tournament.organizerId !== auth.userId) {
        return next(createError(403, 'Forbidden: you do not organize this tournament'));
      }

      // Valid state transition: only PENDING -> APPROVED
      if (reg.status !== 'PENDING') {
        return next(createError(400, `Cannot approve registration in '${reg.status}' status`));
      }

      const updated = await prisma.tournamentTeamRegistration.update({
        where: { id: regId },
        data: { status: 'APPROVED' },
        select: registrationSelect,
      });

      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
);

// ─── PUT /api/registrations/:id/reject ────────────────────────────────────────
router.put(
  '/:id/reject',
  authMiddleware,
  requireRole('ADMIN', 'ORGANIZER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const regId = req.params.id;

      const reg = await prisma.tournamentTeamRegistration.findUnique({
        where: { id: regId },
        include: { tournament: { select: { organizerId: true } } },
      });

      if (!reg) return next(createError(404, 'Registration not found'));

      // ORGANIZER ownership rule: must organize the tournament
      if (auth.role === 'ORGANIZER' && reg.tournament.organizerId !== auth.userId) {
        return next(createError(403, 'Forbidden: you do not organize this tournament'));
      }

      // Valid state transition: only PENDING -> REJECTED
      if (reg.status !== 'PENDING') {
        return next(createError(400, `Cannot reject registration in '${reg.status}' status`));
      }

      const updated = await prisma.tournamentTeamRegistration.update({
        where: { id: regId },
        data: { status: 'REJECTED' },
        select: registrationSelect,
      });

      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
);

// ─── PUT /api/registrations/:id/cancel ────────────────────────────────────────
router.put(
  '/:id/cancel',
  authMiddleware,
  requireRole('ADMIN', 'TEAM_MANAGER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const regId = req.params.id;

      const reg = await prisma.tournamentTeamRegistration.findUnique({
        where: { id: regId },
        include: { team: { select: { managerId: true } } },
      });

      if (!reg) return next(createError(404, 'Registration not found'));

      // TEAM_MANAGER ownership rule: must manage the team
      if (auth.role === 'TEAM_MANAGER' && reg.team.managerId !== auth.userId) {
        return next(createError(403, 'Forbidden: you do not manage this team'));
      }

      // Valid state transition: only PENDING -> CANCELLED
      if (reg.status !== 'PENDING') {
        return next(createError(400, `Cannot cancel registration in '${reg.status}' status`));
      }

      const updated = await prisma.tournamentTeamRegistration.update({
        where: { id: regId },
        data: { status: 'CANCELLED' },
        select: registrationSelect,
      });

      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
