// src/app.ts
import express from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import authRouter from './routes/auth.js';
import sportsRouter from './routes/sports.js';
import tournamentsRouter from './routes/tournaments.js';
import teamsRouter from './routes/teams.js';
import playersRouter from './routes/players.js';
import registrationsRouter from './routes/registrations.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

// Middleware
app.use(cors({ origin: config.frontendUrl, credentials: true }));
app.use(express.json());

// Health check route
app.get('/health', (_req, res) => {
  res.json({ success: true, message: 'OK' });
});

// Register routes
app.use('/api/auth', authRouter);
app.use('/api/sports', sportsRouter);
app.use('/api/tournaments', tournamentsRouter);
app.use('/api/teams', teamsRouter);
app.use('/api/players', playersRouter);
app.use('/api/registrations', registrationsRouter);

// Global error handler
app.use(errorHandler);

export default app;

