// src/validation/teams.ts
import { z } from 'zod';

export const createTeamSchema = z.object({
  name: z.string().min(1, 'Team name is required').max(100),
  shortName: z.string().max(20).optional(),
  sportId: z.string().uuid('Invalid sportId'),
  // managerId only accepted from ADMIN (enforced in route handler)
  managerId: z.string().uuid('Invalid managerId').optional(),
});

export const updateTeamSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  shortName: z.string().max(20).optional(),
  sportId: z.string().uuid('Invalid sportId').optional(),
  // managerId only accepted from ADMIN (enforced in route handler)
  managerId: z.string().uuid('Invalid managerId').optional(),
});

export const addMemberSchema = z.object({
  playerId: z.string().uuid('Invalid playerId'),
});
