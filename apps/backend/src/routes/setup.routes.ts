import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase.js';

const router = Router();

/**
 * Check if initial setup is required
 * Returns true if no auditor accounts exist
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const { count, error } = await supabase
      .from('auditor_profiles')
      .select('*', { count: 'exact', head: true });

    if (error) {
      // Table might not exist yet
      return res.json({
        success: true,
        data: {
          setupRequired: true,
          reason: 'database_not_initialized',
        },
      });
    }

    res.json({
      success: true,
      data: {
        setupRequired: count === 0,
        reason: count === 0 ? 'no_admin_exists' : null,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Create the first admin account (only works if no auditors exist)
 */
router.post('/create-admin', async (req: Request, res: Response) => {
  try {
    const { email, password, name, companyName } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        error: 'Email, password, and name are required',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 6 characters',
      });
    }

    // Check if any auditors already exist
    const { count } = await supabase
      .from('auditor_profiles')
      .select('*', { count: 'exact', head: true });

    if (count && count > 0) {
      return res.status(403).json({
        success: false,
        error: 'Setup already completed. Use the admin panel to create new auditors.',
      });
    }

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      return res.status(400).json({
        success: false,
        error: authError.message,
      });
    }

    // Create auditor profile with admin role
    const { data: profile, error: profileError } = await supabase
      .from('auditor_profiles')
      .insert({
        id: authData.user.id,
        email,
        name,
        role: 'admin',
      })
      .select()
      .single();

    if (profileError) {
      // Cleanup auth user if profile creation fails
      await supabase.auth.admin.deleteUser(authData.user.id);
      return res.status(500).json({
        success: false,
        error: profileError.message,
      });
    }

    // Optionally save company name to settings
    if (companyName) {
      await supabase
        .from('system_settings')
        .upsert({
          key: 'company_name',
          value: JSON.stringify(companyName),
          updated_at: new Date().toISOString(),
        });
    }

    res.status(201).json({
      success: true,
      data: {
        id: authData.user.id,
        email,
        name,
        role: 'admin',
      },
      message: 'Admin account created successfully. You can now login.',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Initialize database tables (run migrations)
 */
router.post('/init-database', async (req: Request, res: Response) => {
  try {
    // Create auditor_profiles table if not exists
    try {
      await supabase.rpc('exec_sql', {
        sql: `
          CREATE TABLE IF NOT EXISTS auditor_profiles (
            id UUID PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            role TEXT DEFAULT 'auditor' CHECK (role IN ('admin', 'auditor', 'viewer')),
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
          );

          ALTER TABLE auditor_profiles ENABLE ROW LEVEL SECURITY;

          DROP POLICY IF EXISTS "Users can view own profile" ON auditor_profiles;
          CREATE POLICY "Users can view own profile" ON auditor_profiles
            FOR SELECT USING (auth.uid() = id);
        `
      });
    } catch { /* ignore */ }

    // Create client_users table if not exists
    try {
      await supabase.rpc('exec_sql', {
        sql: `
          CREATE TABLE IF NOT EXISTS client_users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            email TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            enabled BOOLEAN DEFAULT true,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
          );
        `
      });
    } catch { /* ignore */ }

    // Create system_settings table if not exists
    try {
      await supabase.rpc('exec_sql', {
        sql: `
          CREATE TABLE IF NOT EXISTS system_settings (
            key TEXT PRIMARY KEY,
            value JSONB NOT NULL,
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            updated_by UUID
          );
        `
      });
    } catch { /* ignore */ }

    res.json({
      success: true,
      message: 'Database initialized',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
