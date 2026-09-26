// src/routes/teams.ts
import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../config/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { createTeamSchema, updateTeamSchema, addMemberSchema } from '../validation/teams.js';
import createError from 'http-errors';

const router = Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Safe team select — never expose passwordHash via manager relation */
const teamSelect = {
  id: true,
  name: true,
  shortName: true,
  sportId: true,
  managerId: true,
  createdAt: true,
  updatedAt: true,
  sport: { select: { id: true, name: true } },
  manager: { select: { id: true, name: true, email: true } },
} as const;

/** Verify the requesting TEAM_MANAGER owns this team */
const assertTeamManager = async (userId: string, teamId: string) => {
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { managerId: true } });
  if (!team) return 'not_found';
  if (team.managerId !== userId) return 'forbidden';
  return 'ok';
};

// ─── GET /api/teams ───────────────────────────────────────────────────────────
router.get(
  '/',
  authMiddleware,
  requireRole('ADMIN', 'ORGANIZER', 'TEAM_MANAGER', 'PLAYER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      let teams;

      if (auth.role === 'ADMIN' || auth.role === 'ORGANIZER') {
        // ADMIN and ORGANIZER see all teams
        teams = await prisma.team.findMany({ select: teamSelect });
      } else if (auth.role === 'TEAM_MANAGER') {
        // TEAM_MANAGER sees only teams they manage
        teams = await prisma.team.findMany({
          where: { managerId: auth.userId },
          select: teamSelect,
        });
      } else {
        // PLAYER sees teams they belong to
        const memberships = await prisma.teamMembership.findMany({
          where: { player: { userId: auth.userId } },
          select: { teamId: true },
        });
        const teamIds = memberships.map((m) => m.teamId);
        teams = await prisma.team.findMany({
          where: { id: { in: teamIds } },
          select: teamSelect,
        });
      }

      res.json({ success: true, data: teams });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/teams/:id ───────────────────────────────────────────────────────
router.get(
  '/:id',
  authMiddleware,
  requireRole('ADMIN', 'ORGANIZER', 'TEAM_MANAGER', 'PLAYER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const team = await prisma.team.findUnique({
        where: { id: req.params.id },
        select: {
          ...teamSelect,
          memberships: {
            include: {
              player: {
                select: {
                  id: true,
                  jerseyNumber: true,
                  dateOfBirth: true,
                  user: { select: { id: true, name: true, email: true } },
                },
              },
            },
          },
        },
      });
      if (!team) return next(createError(404, 'Team not found'));

      // TEAM_MANAGER can only view their own team
      if (auth.role === 'TEAM_MANAGER' && team.managerId !== auth.userId) {
        return next(createError(403, 'Forbidden: not your team'));
      }

      // PLAYER can only view a team they belong to
      if (auth.role === 'PLAYER') {
        const member = team.memberships.find((m) => m.player.user.id === auth.userId);
        if (!member) return next(createError(403, 'Forbidden: you are not a member of this team'));
      }

      res.json({ success: true, data: team });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/teams ──────────────────────────────────────────────────────────
router.post(
  '/',
  authMiddleware,
  requireRole('ADMIN', 'TEAM_MANAGER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const parsed = createTeamSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(createError(400, parsed.error.errors[0]?.message ?? 'Invalid input'));
      }

      const { name, shortName, sportId } = parsed.data;
      let managerId = parsed.data.managerId;

      // TEAM_MANAGER: auto-assign themselves as manager, ignore any provided managerId
      if (auth.role === 'TEAM_MANAGER') {
        managerId = auth.userId;
      }

      // Validate sport exists
      const sport = await prisma.sport.findUnique({ where: { id: sportId } });
      if (!sport) return next(createError(400, 'Invalid sportId: sport not found'));

      // Validate managerId user exists and has TEAM_MANAGER role (ADMIN only)
      if (managerId && auth.role === 'ADMIN') {
        const mgr = await prisma.user.findUnique({
          where: { id: managerId },
          include: { role: true },
        });
        if (!mgr) return next(createError(400, 'Invalid managerId: user not found'));
        if (mgr.role.name !== 'TEAM_MANAGER') {
          return next(createError(400, 'managerId must reference a user with TEAM_MANAGER role'));
        }
      }

      const team = await prisma.team.create({
        data: {
          name,
          shortName,
          sport: { connect: { id: sportId } },
          ...(managerId ? { manager: { connect: { id: managerId } } } : {}),
        },
        select: teamSelect,
      });

      res.status(201).json({ success: true, data: team });
    } catch (err) {
      next(err);
    }
  }
);

// ─── PUT /api/teams/:id ───────────────────────────────────────────────────────
router.put(
  '/:id',
  authMiddleware,
  requireRole('ADMIN', 'TEAM_MANAGER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const teamId = req.params.id;

      // TEAM_MANAGER ownership check
      if (auth.role === 'TEAM_MANAGER') {
        const status = await assertTeamManager(auth.userId, teamId);
        if (status === 'not_found') return next(createError(404, 'Team not found'));
        if (status === 'forbidden') return next(createError(403, 'Forbidden: not your team'));
      }

      const parsed = updateTeamSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(createError(400, parsed.error.errors[0]?.message ?? 'Invalid input'));
      }

      const { name, shortName, sportId } = parsed.data;
      let managerId = parsed.data.managerId;

      // TEAM_MANAGER cannot change managerId
      if (auth.role === 'TEAM_MANAGER') {
        managerId = undefined;
      }

      // Validate sportId if provided
      if (sportId) {
        const sport = await prisma.sport.findUnique({ where: { id: sportId } });
        if (!sport) return next(createError(400, 'Invalid sportId: sport not found'));
      }

      // Validate managerId if provided by ADMIN
      if (managerId && auth.role === 'ADMIN') {
        const mgr = await prisma.user.findUnique({
          where: { id: managerId },
          include: { role: true },
        });
        if (!mgr) return next(createError(400, 'Invalid managerId: user not found'));
        if (mgr.role.name !== 'TEAM_MANAGER') {
          return next(createError(400, 'managerId must reference a user with TEAM_MANAGER role'));
        }
      }

      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (shortName !== undefined) updateData.shortName = shortName;
      if (sportId !== undefined) updateData.sport = { connect: { id: sportId } };
      if (managerId !== undefined) updateData.manager = { connect: { id: managerId } };

      const team = await prisma.team.update({
        where: { id: teamId },
        data: updateData,
        select: teamSelect,
      });

      res.json({ success: true, data: team });
    } catch (err) {
      if ((err as any).code === 'P2025') return next(createError(404, 'Team not found'));
      next(err);
    }
  }
);

// ─── DELETE /api/teams/:id ────────────────────────────────────────────────────
router.delete(
  '/:id',
  authMiddleware,
  requireRole('ADMIN', 'TEAM_MANAGER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const teamId = req.params.id;

      const team = await prisma.team.findUnique({
        where: { id: teamId },
        include: {
          memberships: true,
          homeMatches: true,
          awayMatches: true,
          registrations: true,
        },
      });
      if (!team) return next(createError(404, 'Team not found'));

      // TEAM_MANAGER ownership check
      if (auth.role === 'TEAM_MANAGER' && team.managerId !== auth.userId) {
        return next(createError(403, 'Forbidden: not your team'));
      }

      // Guard against unsafe deletion with existing relations
      if (team.homeMatches.length > 0 || team.awayMatches.length > 0) {
        return next(createError(409, 'Cannot delete team with existing matches'));
      }
      if (team.registrations.length > 0) {
        return next(createError(409, 'Cannot delete team with tournament registrations'));
      }

      // Safe to delete memberships first, then the team
      if (team.memberships.length > 0) {
        await prisma.teamMembership.deleteMany({ where: { teamId } });
      }

      await prisma.team.delete({ where: { id: teamId } });
      res.json({ success: true, message: 'Team deleted' });
    } catch (err) {
      if ((err as any).code === 'P2025') return next(createError(404, 'Team not found'));
      next(err);
    }
  }
);

// ─── GET /api/teams/:id/members ───────────────────────────────────────────────
router.get(
  '/:id/members',
  authMiddleware,
  requireRole('ADMIN', 'ORGANIZER', 'TEAM_MANAGER', 'PLAYER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const teamId = req.params.id;

      const team = await prisma.team.findUnique({ where: { id: teamId }, select: { managerId: true } });
      if (!team) return next(createError(404, 'Team not found'));

      if (auth.role === 'TEAM_MANAGER' && team.managerId !== auth.userId) {
        return next(createError(403, 'Forbidden: not your team'));
      }

      if (auth.role === 'PLAYER') {
        // Player must be a member of this team
        const player = await prisma.player.findUnique({ where: { userId: auth.userId } });
        if (!player) return next(createError(403, 'Forbidden: no player profile'));
        const membership = await prisma.teamMembership.findUnique({
          where: { teamId_playerId: { teamId, playerId: player.id } },
        });
        if (!membership) return next(createError(403, 'Forbidden: not a member of this team'));
      }

      const memberships = await prisma.teamMembership.findMany({
        where: { teamId },
        include: {
          player: {
            select: {
              id: true,
              jerseyNumber: true,
              dateOfBirth: true,
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
      });

      res.json({ success: true, data: memberships });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/teams/:id/members ──────────────────────────────────────────────
router.post(
  '/:id/members',
  authMiddleware,
  requireRole('ADMIN', 'TEAM_MANAGER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const teamId = req.params.id;

      const team = await prisma.team.findUnique({ where: { id: teamId }, select: { managerId: true } });
      if (!team) return next(createError(404, 'Team not found'));

      if (auth.role === 'TEAM_MANAGER' && team.managerId !== auth.userId) {
        return next(createError(403, 'Forbidden: not your team'));
      }

      const parsed = addMemberSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(createError(400, parsed.error.errors[0]?.message ?? 'Invalid input'));
      }

      const { playerId } = parsed.data;
      const player = await prisma.player.findUnique({ where: { id: playerId } });
      if (!player) return next(createError(404, 'Player not found'));

      try {
        const membership = await prisma.teamMembership.create({
          data: { teamId, playerId },
          include: {
            player: {
              select: {
                id: true,
                jerseyNumber: true,
                user: { select: { id: true, name: true, email: true } },
              },
            },
          },
        });
        res.status(201).json({ success: true, data: membership });
      } catch (err: any) {
        if (err.code === 'P2002') return next(createError(409, 'Player is already a member of this team'));
        throw err;
      }
    } catch (err) {
      next(err);
    }
  }
);

// ─── DELETE /api/teams/:id/members/:playerId ──────────────────────────────────
router.delete(
  '/:id/members/:playerId',
  authMiddleware,
  requireRole('ADMIN', 'TEAM_MANAGER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const { id: teamId, playerId } = req.params;

      const team = await prisma.team.findUnique({ where: { id: teamId }, select: { managerId: true } });
      if (!team) return next(createError(404, 'Team not found'));

      if (auth.role === 'TEAM_MANAGER' && team.managerId !== auth.userId) {
        return next(createError(403, 'Forbidden: not your team'));
      }

      const membership = await prisma.teamMembership.findUnique({
        where: { teamId_playerId: { teamId, playerId } },
      });
      if (!membership) return next(createError(404, 'Player is not a member of this team'));

      await prisma.teamMembership.delete({
        where: { teamId_playerId: { teamId, playerId } },
      });

      res.json({ success: true, message: 'Player removed from team' });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
