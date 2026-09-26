// src/routes/players.ts
import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../config/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { createPlayerSchema, updatePlayerSchema } from '../validation/players.js';
import createError from 'http-errors';

const router = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Safe player select — never expose passwordHash */
const playerSelect = {
  id: true,
  userId: true,
  dateOfBirth: true,
  jerseyNumber: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, name: true, email: true } },
  memberships: {
    include: {
      team: { select: { id: true, name: true, shortName: true } },
    },
  },
} as const;

/**
 * Determine which team(s) a TEAM_MANAGER manages, then return true
 * if a given playerId belongs to one of those teams.
 */
const isPlayerInManagerTeam = async (managerId: string, playerId: string): Promise<boolean> => {
  const membership = await prisma.teamMembership.findFirst({
    where: {
      playerId,
      team: { managerId },
    },
  });
  return membership !== null;
};

// ─── GET /api/players ─────────────────────────────────────────────────────────
router.get(
  '/',
  authMiddleware,
  requireRole('ADMIN', 'ORGANIZER', 'TEAM_MANAGER', 'PLAYER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;

      let players;
      if (auth.role === 'ADMIN' || auth.role === 'ORGANIZER') {
        // Optional filter by teamId
        const { teamId } = req.query;
        if (teamId && typeof teamId === 'string') {
          const team = await prisma.team.findUnique({ where: { id: teamId } });
          if (!team) return next(createError(404, 'Team not found'));
          players = await prisma.player.findMany({
            where: { memberships: { some: { teamId } } },
            select: playerSelect,
          });
        } else {
          players = await prisma.player.findMany({ select: playerSelect });
        }
      } else if (auth.role === 'TEAM_MANAGER') {
        // TEAM_MANAGER sees only players in their teams
        players = await prisma.player.findMany({
          where: { memberships: { some: { team: { managerId: auth.userId } } } },
          select: playerSelect,
        });
      } else {
        // PLAYER sees only themselves
        players = await prisma.player.findMany({
          where: { userId: auth.userId },
          select: playerSelect,
        });
      }

      res.json({ success: true, data: players });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/players/:id ─────────────────────────────────────────────────────
router.get(
  '/:id',
  authMiddleware,
  requireRole('ADMIN', 'ORGANIZER', 'TEAM_MANAGER', 'PLAYER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const player = await prisma.player.findUnique({
        where: { id: req.params.id },
        select: playerSelect,
      });
      if (!player) return next(createError(404, 'Player not found'));

      if (auth.role === 'TEAM_MANAGER') {
        const allowed = await isPlayerInManagerTeam(auth.userId, player.id);
        if (!allowed) return next(createError(403, 'Forbidden: player is not in your team'));
      }

      if (auth.role === 'PLAYER' && player.userId !== auth.userId) {
        return next(createError(403, 'Forbidden: not your profile'));
      }

      res.json({ success: true, data: player });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/players ────────────────────────────────────────────────────────
router.post(
  '/',
  authMiddleware,
  requireRole('ADMIN', 'TEAM_MANAGER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const parsed = createPlayerSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(createError(400, parsed.error.errors[0]?.message ?? 'Invalid input'));
      }

      const { userId, dateOfBirth, jerseyNumber, teamId } = parsed.data;

      // Validate user exists
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return next(createError(400, 'Invalid userId: user not found'));

      // Ensure user does not already have a player profile
      const existing = await prisma.player.findUnique({ where: { userId } });
      if (existing) return next(createError(409, 'User already has a player profile'));

      // If teamId provided, validate it
      if (teamId) {
        const team = await prisma.team.findUnique({ where: { id: teamId } });
        if (!team) return next(createError(400, 'Invalid teamId: team not found'));
        // TEAM_MANAGER can only assign to their own team
        if (auth.role === 'TEAM_MANAGER' && team.managerId !== auth.userId) {
          return next(createError(403, 'Forbidden: cannot add player to a team you do not manage'));
        }
      }

      // Create player and optionally add to team in a transaction
      const player = await prisma.$transaction(async (tx) => {
        const p = await tx.player.create({
          data: {
            userId,
            dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
            jerseyNumber,
          },
          select: playerSelect,
        });

        if (teamId) {
          await tx.teamMembership.create({
            data: { teamId, playerId: p.id },
          });
          // Re-fetch with fresh memberships
          return tx.player.findUnique({ where: { id: p.id }, select: playerSelect });
        }
        return p;
      });

      res.status(201).json({ success: true, data: player });
    } catch (err) {
      if ((err as any).code === 'P2002') return next(createError(409, 'Duplicate player or membership'));
      next(err);
    }
  }
);

// ─── PUT /api/players/:id ─────────────────────────────────────────────────────
router.put(
  '/:id',
  authMiddleware,
  requireRole('ADMIN', 'TEAM_MANAGER', 'PLAYER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const playerId = req.params.id;

      const player = await prisma.player.findUnique({ where: { id: playerId }, select: { id: true, userId: true } });
      if (!player) return next(createError(404, 'Player not found'));

      // PLAYER can only update their own profile
      if (auth.role === 'PLAYER' && player.userId !== auth.userId) {
        return next(createError(403, 'Forbidden: not your profile'));
      }

      // TEAM_MANAGER can only update players in their teams
      if (auth.role === 'TEAM_MANAGER') {
        const allowed = await isPlayerInManagerTeam(auth.userId, playerId);
        if (!allowed) return next(createError(403, 'Forbidden: player is not in your team'));
      }

      const parsed = updatePlayerSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(createError(400, parsed.error.errors[0]?.message ?? 'Invalid input'));
      }

      const { dateOfBirth, jerseyNumber } = parsed.data;

      const updated = await prisma.player.update({
        where: { id: playerId },
        data: {
          ...(dateOfBirth !== undefined ? { dateOfBirth: new Date(dateOfBirth) } : {}),
          ...(jerseyNumber !== undefined ? { jerseyNumber } : {}),
        },
        select: playerSelect,
      });

      res.json({ success: true, data: updated });
    } catch (err) {
      if ((err as any).code === 'P2025') return next(createError(404, 'Player not found'));
      next(err);
    }
  }
);

// ─── DELETE /api/players/:id ──────────────────────────────────────────────────
router.delete(
  '/:id',
  authMiddleware,
  requireRole('ADMIN', 'TEAM_MANAGER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const playerId = req.params.id;

      const player = await prisma.player.findUnique({
        where: { id: playerId },
        include: {
          memberships: true,
          statistics: true,
          matchEvents: true,
        },
      });
      if (!player) return next(createError(404, 'Player not found'));

      // TEAM_MANAGER can only delete players in their teams
      if (auth.role === 'TEAM_MANAGER') {
        const allowed = await isPlayerInManagerTeam(auth.userId, playerId);
        if (!allowed) return next(createError(403, 'Forbidden: player is not in your team'));
      }

      // Guard: do not delete players with match events or statistics (history must be preserved)
      if (player.matchEvents.length > 0 || player.statistics.length > 0) {
        return next(createError(409, 'Cannot delete player with match history or statistics'));
      }

      // Safe to remove memberships then player
      if (player.memberships.length > 0) {
        await prisma.teamMembership.deleteMany({ where: { playerId } });
      }

      await prisma.player.delete({ where: { id: playerId } });
      res.json({ success: true, message: 'Player deleted' });
    } catch (err) {
      if ((err as any).code === 'P2025') return next(createError(404, 'Player not found'));
      next(err);
    }
  }
);

export default router;
