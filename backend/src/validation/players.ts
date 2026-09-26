// src/validation/players.ts
import { z } from 'zod';

export const createPlayerSchema = z.object({
  userId: z.string().uuid('Invalid userId'),
  dateOfBirth: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid dateOfBirth' })
    .optional(),
  jerseyNumber: z.number().int().min(0).max(999).optional(),
  // teamId is optional — when provided by TEAM_MANAGER, they can set their own team.
  // Admin can optionally provide any teamId.
  teamId: z.string().uuid('Invalid teamId').optional(),
});

export const updatePlayerSchema = z.object({
  dateOfBirth: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid dateOfBirth' })
    .optional(),
  jerseyNumber: z.number().int().min(0).max(999).optional(),
});
