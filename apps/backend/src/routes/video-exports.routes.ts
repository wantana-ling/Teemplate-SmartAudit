import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase.js';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const router = Router();

/**
 * Request video export
 * Creates a job to convert .guac → MP4 on-demand
 *
 * Body: { quality: 'low' | 'medium' | 'high' }
 */
router.post('/:sessionId/export', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { quality = 'medium' } = req.body;

    // Validate session exists and has recording
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('id, guac_recording_url, status')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    if (!session.guac_recording_url) {
      return res.status(400).json({
        success: false,
        error: 'Session has no recording available',
      });
    }

    if (session.status === 'active') {
      return res.status(400).json({
        success: false,
        error: 'Cannot export video while session is still active',
      });
    }

    // Check if export already exists
    const { data: existingJob } = await supabase
      .from('video_export_jobs')
      .select('*')
      .eq('session_id', sessionId)
      .eq('status', 'ready')
      .single();

    if (existingJob && new Date(existingJob.expires_at) > new Date()) {
      // Return existing job
      return res.json({
        success: true,
        data: {
          jobId: existingJob.id,
          status: 'ready',
          downloadUrl: `/api/video-exports/${existingJob.id}/download/${existingJob.download_token}`,
          expiresAt: existingJob.expires_at,
        },
        message: 'Video already available for download',
      });
    }

    // Create new export job
    const downloadToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 3600000); // 1 hour

    const { data: job, error: jobError } = await supabase
      .from('video_export_jobs')
      .insert({
        session_id: sessionId,
        quality,
        status: 'pending',
        download_token: downloadToken,
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (jobError) {
      return res.status(500).json({
        success: false,
        error: jobError.message,
      });
    }

    // TODO: Add to background job queue
    // For now, return pending status
    // videoExportQueue.add({ jobId: job.id, sessionId, quality });

    res.status(202).json({
      success: true,
      data: {
        jobId: job.id,
        status: 'pending',
        statusUrl: `/api/video-exports/${job.id}/status`,
        estimatedTime: 'Video conversion will be implemented in Phase 2.5',
      },
      message: 'Export job created - conversion not yet implemented',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Get export job status
 */
router.get('/:jobId/status', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    const { data: job, error } = await supabase
      .from('video_export_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (error || !job) {
      return res.status(404).json({
        success: false,
        error: 'Export job not found',
      });
    }

    const response: any = {
      success: true,
      data: {
        jobId: job.id,
        sessionId: job.session_id,
        status: job.status,
        progress: job.progress_percent,
        quality: job.quality,
        createdAt: job.created_at,
      },
    };

    if (job.status === 'ready') {
      response.data.downloadUrl = `/api/video-exports/${job.id}/download/${job.download_token}`;
      response.data.expiresAt = job.expires_at;
      response.data.fileSizeMB = job.output_size_bytes
        ? (job.output_size_bytes / 1024 / 1024).toFixed(2)
        : null;
    }

    if (job.status === 'failed') {
      response.data.error = job.error_message;
    }

    res.json(response);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Download exported video
 * Streams MP4 from /tmp to user
 */
router.get('/:jobId/download/:token', async (req: Request, res: Response) => {
  try {
    const { jobId, token } = req.params;

    // Verify job exists and token matches
    const { data: job, error } = await supabase
      .from('video_export_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('download_token', token)
      .single();

    if (error || !job) {
      return res.status(404).json({
        success: false,
        error: 'Export not found or invalid token',
      });
    }

    // Check if expired
    if (new Date(job.expires_at) < new Date()) {
      return res.status(410).json({
        success: false,
        error: 'Download link expired',
        message: 'Please request a new video export',
      });
    }

    // Check if ready
    if (job.status !== 'ready') {
      return res.status(400).json({
        success: false,
        error: `Video not ready (status: ${job.status})`,
      });
    }

    // Check if file exists
    if (!job.temp_file_path || !(await fs.access(job.temp_file_path).then(() => true).catch(() => false))) {
      return res.status(500).json({
        success: false,
        error: 'Video file not found on server',
      });
    }

    // Get file stats
    const stats = await fs.stat(job.temp_file_path);

    // Stream video to user
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Length', stats.size.toString());
    res.setHeader('Content-Disposition', `attachment; filename="session-${job.session_id}.mp4"`);
    res.setHeader('Cache-Control', 'no-cache');

    const fileStream = (await import('fs')).createReadStream(job.temp_file_path);
    fileStream.pipe(res);

    // Log download
    await supabase.from('audit_logs').insert({
      action: 'video_export_downloaded',
      resource_type: 'video_export_job',
      resource_id: jobId,
      metadata: {
        session_id: job.session_id,
        file_size: stats.size,
      },
    });

    // Mark as downloaded and schedule cleanup
    fileStream.on('end', async () => {
      await supabase
        .from('video_export_jobs')
        .update({
          downloaded_at: new Date().toISOString(),
          status: 'expired',
        })
        .eq('id', jobId);

      // Delete temp file after 5 minutes
      setTimeout(async () => {
        try {
          await fs.unlink(job.temp_file_path!);
          console.log(`[VideoExport] Cleaned up ${job.temp_file_path}`);
        } catch (err) {
          console.error(`[VideoExport] Cleanup failed:`, err);
        }
      }, 300000);
    });

    fileStream.on('error', (err) => {
      console.error(`[VideoExport] Stream error:`, err);
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Cancel export job
 */
router.delete('/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    const { data: job, error: fetchError } = await supabase
      .from('video_export_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (fetchError || !job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found',
      });
    }

    // Delete temp file if exists
    if (job.temp_file_path) {
      try {
        await fs.unlink(job.temp_file_path);
      } catch (err) {
        // File might not exist, ignore error
      }
    }

    // Mark as failed/cancelled
    const { error } = await supabase
      .from('video_export_jobs')
      .update({ status: 'failed', error_message: 'Cancelled by user' })
      .eq('id', jobId);

    if (error) {
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }

    res.json({
      success: true,
      message: 'Export job cancelled',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
