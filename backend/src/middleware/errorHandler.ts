// src/middleware/errorHandler.ts
import { Request, Response, NextFunction } from 'express';

// Centralized error handling middleware
// Expects errors to have optional "statusCode" and "message" properties.
export const errorHandler = (err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.statusCode ?? 500;
  const message = err.message ?? 'Internal Server Error';
  // Log the error for debugging (avoid leaking details in prod)
  console.error(`[Error] ${status}: ${message}`, err);
  res.status(status).json({ success: false, message });
};
