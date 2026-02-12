/**
 * Script to create an auditor account
 * Usage: npx tsx scripts/create-auditor.ts <email> <password> <name> [role]
 *
 * Example: npx tsx scripts/create-auditor.ts admin@company.com MySecurePass123 "John Admin" admin
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://fcrbxompysripqydafeu.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('Error: SUPABASE_SERVICE_KEY environment variable is required');
  console.log('\nTo get your service key:');
  console.log('1. Go to your Supabase dashboard');
  console.log('2. Navigate to Settings > API');
  console.log('3. Copy the "service_role" key (NOT the anon key)');
  console.log('\nThen run:');
  console.log('SUPABASE_SERVICE_KEY=your_key npx tsx scripts/create-auditor.ts <email> <password> <name> [role]');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function createAuditor() {
  const [, , email, password, name, role = 'auditor'] = process.argv;

  if (!email || !password || !name) {
    console.log('Usage: npx tsx scripts/create-auditor.ts <email> <password> <name> [role]');
    console.log('');
    console.log('Arguments:');
    console.log('  email    - Auditor email address');
    console.log('  password - Login password (min 6 characters)');
    console.log('  name     - Display name');
    console.log('  role     - Optional: admin, auditor, or viewer (default: auditor)');
    console.log('');
    console.log('Example:');
    console.log('  SUPABASE_SERVICE_KEY=xxx npx tsx scripts/create-auditor.ts admin@company.com Pass123! "John Admin" admin');
    process.exit(1);
  }

  if (!['admin', 'auditor', 'viewer'].includes(role)) {
    console.error('Error: role must be "admin", "auditor", or "viewer"');
    process.exit(1);
  }

  console.log(`Creating auditor account for: ${email}`);

  try {
    // 1. Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      throw new Error(`Auth error: ${authError.message}`);
    }

    console.log(`✓ Auth user created: ${authData.user.id}`);

    // 2. Create auditor profile
    const { data: profile, error: profileError } = await supabase
      .from('auditor_profiles')
      .insert({
        id: authData.user.id,
        email,
        name,
        role,
      })
      .select()
      .single();

    if (profileError) {
      // Cleanup: delete auth user if profile creation fails
      await supabase.auth.admin.deleteUser(authData.user.id);
      throw new Error(`Profile error: ${profileError.message}`);
    }

    console.log(`✓ Auditor profile created`);
    console.log('');
    console.log('=== Auditor Account Created ===');
    console.log(`Email: ${email}`);
    console.log(`Name: ${name}`);
    console.log(`Role: ${role}`);
    console.log(`ID: ${authData.user.id}`);
    console.log('');
    console.log('You can now login to the Auditor Desktop App with these credentials.');

  } catch (error: any) {
    console.error('Failed to create auditor:', error.message);
    process.exit(1);
  }
}

createAuditor();
