import cors from 'cors';
import { logger } from '../utils/logger.js';

/**
 * CORS configuration for Electron desktop apps
 */
export const corsOptions = {
  // Allow requests from Electron apps running on localhost
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (like Electron apps)
    if (!origin) {
      return callback(null, true);
    }

    // Allow localhost on any port (dev environment)
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      return callback(null, true);
    }

    // Allow file:// protocol (Electron apps)
    if (origin.startsWith('file://')) {
      return callback(null, true);
    }

    // In production, check against whitelist
    const whitelist = process.env.CORS_ORIGINS?.split(',') || [];
    if (whitelist.includes(origin)) {
      return callback(null, true);
    }

    logger.warn(`[CORS] Rejected origin: ${origin}`);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 86400, // 24 hours
};

export const corsMiddleware = cors(corsOptions);
