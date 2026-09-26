// src/validation/registrations.ts
import { z } from 'zod';

export const registerTeamSchema = z.object({
  teamId: z.string().uuid('Invalid teamId'),
});
