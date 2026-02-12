import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

/**
 * Request logger middleware
 * Logs all incoming requests with timing
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'debug';
    logger.log(level, `${req.method} ${req.path} ${statusCode} ${duration}ms`);
  });

  next();
}
