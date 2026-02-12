import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase.js';

const router = Router();

/**
 * Get storage usage statistics
 */
router.get('/usage', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase.rpc('get_storage_usage');

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    const usage = data[0];
    const warnings = [];

    if (usage.usage_percent >= 95) {
      warnings.push('CRITICAL: Storage nearly full - immediate cleanup required');
    } else if (usage.usage_percent >= 80) {
      warnings.push('WARNING: Storage usage high - consider cleanup');
    }

    res.json({
      success: true,
      data: usage,
      warnings,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get storage dashboard (comprehensive view)
 */
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('storage_dashboard')
      .select('*')
      .single();

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    res.json({
      success: true,
      data,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get largest files
 */
router.get('/largest-files', async (req: Request, res: Response) => {
  try {
    const limit = Number(req.query.limit) || 10;

    const { data, error } = await supabase.rpc('get_largest_files', {
      limit_count: limit,
    });

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    res.json({
      success: true,
      data,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Run cleanup (delete old recordings)
 */
router.post('/cleanup', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase.rpc('cleanup_old_storage');

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    const result = data[0];

    res.json({
      success: true,
      data: result,
      message: `Cleaned up ${result.deleted_count} recordings, freed ${result.freed_mb} MB`,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Cleanup expired video exports
 */
router.post('/cleanup-videos', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase.rpc('cleanup_expired_video_exports');

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    const result = data[0];

    // Delete temp files from disk
    if (result.deleted_files && result.deleted_files.length > 0) {
      const fs = await import('fs/promises');
      for (const filePath of result.deleted_files) {
        try {
          await fs.unlink(filePath);
          console.log(`[Storage] Deleted expired video: ${filePath}`);
        } catch (err) {
          console.error(`[Storage] Failed to delete ${filePath}:`, err);
        }
      }
    }

    res.json({
      success: true,
      data: result,
      message: `Cleaned up ${result.cleaned_count} expired video exports`,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
