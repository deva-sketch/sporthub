// src/validation/tournaments.ts
import { z } from 'zod';
import { TournamentFormat, TournamentStatus } from '@prisma/client';

export const createTournamentSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  sportId: z.string().uuid('Invalid sportId'),
  format: z.nativeEnum(TournamentFormat),
  startDate: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid startDate' }),
  endDate: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid endDate' }),
  registrationDeadline: z.string().refine((val) => !isNaN(Date.parse(val)), { message: 'Invalid registrationDeadline' }),
  status: z.nativeEnum(TournamentStatus).optional(),
  maxTeams: z.number().int().positive().optional(),
  location: z.string().optional(),
});

export const updateTournamentSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  sportId: z.string().uuid().optional(),
  format: z.nativeEnum(TournamentFormat).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  registrationDeadline: z.string().optional(),
  status: z.nativeEnum(TournamentStatus).optional(),
  maxTeams: z.number().int().positive().optional(),
  location: z.string().optional(),
});
