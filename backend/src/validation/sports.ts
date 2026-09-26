// src/validation/sports.ts
import { z } from 'zod';

export const createSportSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  // optional active flag if the model has it (the schema currently does not have "active", but we keep for future safety)
  active: z.boolean().optional(),
});

export const updateSportSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  active: z.boolean().optional(),
});
