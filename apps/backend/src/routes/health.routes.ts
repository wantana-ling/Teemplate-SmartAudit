import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase.js';

const router = Router();

/**
 * Health check endpoint
 * Returns basic service health status
 */
router.get('/health', async (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'SmartAudit Backend',
    version: '1.0.0',
  });
});

/**
 * Readiness check endpoint
 * Checks if service is ready to accept requests
 * Verifies database connectivity
 */
router.get('/ready', async (req: Request, res: Response) => {
  try {
    // Test database connection
    const { error } = await supabase.from('sessions').select('count').limit(1);

    if (error) {
      return res.status(503).json({
        status: 'not_ready',
        error: 'Database connection failed',
        details: error.message,
      });
    }

    res.json({
      status: 'ready',
      timestamp: new Date().toISOString(),
      checks: {
        database: 'connected',
      },
    });
  } catch (error: any) {
    res.status(503).json({
      status: 'not_ready',
      error: error.message,
    });
  }
});

export default router;
