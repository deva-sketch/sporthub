// src/routes/tournaments.ts
import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../config/prisma.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { createTournamentSchema, updateTournamentSchema } from '../validation/tournaments.js';
import { registerTeamSchema } from '../validation/registrations.js';
import createError from 'http-errors';

const router = Router();

// Helper to check if user is organizer of a tournament
const isOrganizer = async (userId: string, tournamentId: string) => {
  const t = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { organizerId: true } });
  return t?.organizerId === userId;
};

// GET all tournaments (any authorized role)
router.get('/', authMiddleware, requireRole('ADMIN', 'ORGANIZER', 'TEAM_MANAGER', 'PLAYER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tournaments = await prisma.tournament.findMany({ include: { sport: true, organizer: { select: { id: true, name: true } } } });
    res.json({ success: true, data: tournaments });
  } catch (err) {
    next(err);
  }
});

// GET single tournament
router.get('/:id', authMiddleware, requireRole('ADMIN', 'ORGANIZER', 'TEAM_MANAGER', 'PLAYER'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const t = await prisma.tournament.findUnique({
      where: { id: req.params.id },
      include: { sport: true, organizer: { select: { id: true, name: true } } },
    });
    if (!t) return next(createError(404, 'Tournament not found'));
    res.json({ success: true, data: t });
  } catch (err) {
    next(err);
  }
});

// POST create tournament (ADMIN or ORGANIZER)
router.post(
  '/',
  authMiddleware,
  requireRole('ADMIN', 'ORGANIZER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = createTournamentSchema.safeParse(req.body);
      if (!parsed.success) return next(createError(400, 'Invalid input'));
      const {
        name,
        description,
        sportId,
        format,
        startDate,
        endDate,
        registrationDeadline,
        status,
        maxTeams,
        location,
      } = parsed.data;

      // Validate sport exists
      const sport = await prisma.sport.findUnique({ where: { id: sportId } });
      if (!sport) return next(createError(400, 'Invalid sportId'));

      // Enforce date logic
      if (new Date(startDate) > new Date(endDate))
        return next(createError(400, 'startDate must be before endDate'));
      if (new Date(registrationDeadline) > new Date(startDate))
        return next(createError(400, 'registrationDeadline must be before startDate'));

      const organizerId = (req as any).auth.userId;

      const tournament = await prisma.tournament.create({
        data: {
          name,
          description,
          sport: { connect: { id: sportId } },
          format,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          registrationDeadline: new Date(registrationDeadline),
          status,
          maxTeams,
          location,
          organizer: { connect: { id: organizerId } },
        },
      });
      res.status(201).json({ success: true, data: tournament });
    } catch (err) {
      next(err);
    }
  }
);

// PUT update tournament (ADMIN can any, ORGANIZER only own)
router.put(
  '/:id',
  authMiddleware,
  requireRole('ADMIN', 'ORGANIZER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = updateTournamentSchema.safeParse(req.body);
      if (!parsed.success) return next(createError(400, 'Invalid input'));

      const userId = (req as any).auth.userId;
      const role = (req as any).auth.role;
      const tournamentId = req.params.id;

      if (role === 'ORGANIZER') {
        const ok = await isOrganizer(userId, tournamentId);
        if (!ok) return next(createError(403, 'Forbidden: not your tournament'));
      }

      const updateData: any = { ...parsed.data };

      // Validate dates if present
      if (updateData.startDate && updateData.endDate && new Date(updateData.startDate) > new Date(updateData.endDate)) {
        return next(createError(400, 'startDate must be before endDate'));
      }
      if (updateData.registrationDeadline && updateData.startDate && new Date(updateData.registrationDeadline) > new Date(updateData.startDate)) {
        return next(createError(400, 'registrationDeadline must be before startDate'));
      }

      // Validate sportId if changed
      if (updateData.sportId) {
        const sportExists = await prisma.sport.findUnique({ where: { id: updateData.sportId } });
        if (!sportExists) return next(createError(400, 'Invalid sportId'));
        updateData.sport = { connect: { id: updateData.sportId } }; // Prisma relation field
        delete updateData.sportId;
      }

      // Status transition guard (cannot move out of COMPLETED or CANCELLED)
      if (updateData.status) {
        const current = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { status: true } });
        if (current?.status && ['COMPLETED', 'CANCELLED'].includes(current.status) && current.status !== updateData.status) {
          return next(createError(400, 'Cannot change status from COMPLETED or CANCELLED'));
        }
      }

      const tournament = await prisma.tournament.update({
        where: { id: tournamentId },
        data: updateData,
      });
      res.json({ success: true, data: tournament });
    } catch (err) {
      if ((err as any).code === 'P2025') return next(createError(404, 'Tournament not found'));
      next(err);
    }
  }
);

// DELETE tournament (ADMIN only)
router.delete('/:id', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.tournament.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Tournament deleted' });
  } catch (err) {
    if ((err as any).code === 'P2025') return next(createError(404, 'Tournament not found'));
    next(err);
  }
});

// ─── Tournament Registration Endpoints ────────────────────────────────────────

const registrationSelect = {
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

// POST /api/tournaments/:tournamentId/registrations
router.post(
  '/:tournamentId/registrations',
  authMiddleware,
  requireRole('ADMIN', 'TEAM_MANAGER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const { tournamentId } = req.params;

      const parsed = registerTeamSchema.safeParse(req.body);
      if (!parsed.success) {
        return next(createError(400, parsed.error.errors[0]?.message ?? 'Invalid input'));
      }

      const { teamId } = parsed.data;

      // 1. Verify tournament exists
      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
      });
      if (!tournament) return next(createError(404, 'Tournament not found'));

      // 2. Verify team exists
      const team = await prisma.team.findUnique({
        where: { id: teamId },
      });
      if (!team) return next(createError(404, 'Team not found'));

      // 3. TEAM_MANAGER ownership check: can only register own team
      if (auth.role === 'TEAM_MANAGER' && team.managerId !== auth.userId) {
        return next(createError(403, 'Forbidden: you can only register teams you manage'));
      }

      // 4. Verify sport compatibility
      if (team.sportId !== tournament.sportId) {
        return next(createError(400, 'Sport mismatch: team and tournament must belong to the same sport'));
      }

      // 5. Verify tournament registration is currently open
      if (tournament.status !== 'REGISTRATION_OPEN') {
        return next(
          createError(400, `Registration is not open for this tournament (current status: ${tournament.status})`)
        );
      }

      // 6. Check registration deadline
      if (new Date() > new Date(tournament.registrationDeadline)) {
        return next(createError(400, 'Registration deadline for this tournament has passed'));
      }

      // 7. Check maxTeams capacity if configured
      if (tournament.maxTeams) {
        const approvedCount = await prisma.tournamentTeamRegistration.count({
          where: { tournamentId, status: 'APPROVED' },
        });
        if (approvedCount >= tournament.maxTeams) {
          return next(createError(400, 'Tournament has reached maximum team capacity'));
        }
      }

      // 8. Create registration with compound unique constraint guard
      try {
        const registration = await prisma.tournamentTeamRegistration.create({
          data: {
            tournamentId,
            teamId,
            status: 'PENDING',
          },
          select: registrationSelect,
        });

        res.status(201).json({ success: true, data: registration });
      } catch (err: any) {
        if (err.code === 'P2002') {
          return next(createError(409, 'Team is already registered for this tournament'));
        }
        throw err;
      }
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/tournaments/:tournamentId/registrations
router.get(
  '/:tournamentId/registrations',
  authMiddleware,
  requireRole('ADMIN', 'ORGANIZER', 'TEAM_MANAGER', 'PLAYER'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const auth = req.auth!;
      const { tournamentId } = req.params;

      const tournament = await prisma.tournament.findUnique({
        where: { id: tournamentId },
      });
      if (!tournament) return next(createError(404, 'Tournament not found'));

      let whereClause: any = { tournamentId };

      if (auth.role === 'ADMIN') {
        // ADMIN sees all registrations for this tournament
      } else if (auth.role === 'ORGANIZER') {
        // ORGANIZER can only view registrations for tournaments they organize
        if (tournament.organizerId !== auth.userId) {
          return next(createError(403, 'Forbidden: you do not organize this tournament'));
        }
      } else if (auth.role === 'TEAM_MANAGER') {
        // TEAM_MANAGER can only see registrations involving teams they manage
        whereClause = {
          tournamentId,
          team: { managerId: auth.userId },
        };
      } else {
        // PLAYER can only see registrations involving teams they are a member of
        const memberships = await prisma.teamMembership.findMany({
          where: { player: { userId: auth.userId } },
          select: { teamId: true },
        });
        const teamIds = memberships.map((m) => m.teamId);
        whereClause = {
          tournamentId,
          teamId: { in: teamIds },
        };
      }

      const registrations = await prisma.tournamentTeamRegistration.findMany({
        where: whereClause,
        select: registrationSelect,
      });

      res.json({ success: true, data: registrations });
    } catch (err) {
      next(err);
    }
  }
);

export default router;

