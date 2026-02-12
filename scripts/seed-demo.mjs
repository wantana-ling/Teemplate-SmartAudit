#!/usr/bin/env node
// ============================================================================
// SmartAIAudit — Seed demo data on a fresh deployment
// ============================================================================
// Creates:
//   1. Super-admin account  (admin / DemoAdmin123!)
//   2. Client user account  (demo  / DemoUser123!)
//   3. Three demo servers   (SSH, VNC, RDP) → pointing at demo-targets.internal
//   4. Grants the client user access to all three servers
//
// Usage:
//   node scripts/seed-demo.mjs https://smartaudit-backend.fly.dev
//   node scripts/seed-demo.mjs http://localhost:8080
// ============================================================================

const BACKEND_URL = process.argv[2] || "http://localhost:8080";

const ADMIN = {
  username: process.env.ADMIN_USER || "admin",
  password: process.env.ADMIN_PASS || "DemoAdmin123!",
  displayName: "Demo Admin",
};

const CLIENT = {
  username: "demo",
  password: "DemoUser123!",
  displayName: "Demo User",
  role: "client",
};

const TARGETS_HOST = "smartaudit-demo-targets.internal";

const SERVERS = [
  {
    name: "Demo SSH",
    host: TARGETS_HOST,
    port: 22,
    protocol: "ssh",
    username: "testuser",
    password: "testpass",
    description: "SSH terminal on the demo target machine",
  },
  {
    name: "Demo VNC",
    host: TARGETS_HOST,
    port: 5900,
    protocol: "vnc",
    username: "testuser",
    password: "testpass",
    description: "VNC desktop (XFCE) on the demo target machine",
  },
  {
    name: "Demo RDP",
    host: TARGETS_HOST,
    port: 3389,
    protocol: "rdp",
    username: "testuser",
    password: "testpass",
    description: "RDP desktop (xRDP → XFCE) on the demo target machine",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────

async function api(method, path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BACKEND_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = await res.json();
  if (!res.ok && !json.success) {
    throw new Error(`${method} ${path} → ${res.status}: ${json.error}`);
  }
  return json;
}

function log(msg) {
  console.log(`  ▶ ${msg}`);
}

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}

function warn(msg) {
  console.log(`  ⚠ ${msg}`);
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nSeeding demo data on ${BACKEND_URL}\n`);

  // Step 1: Create super admin
  log("Creating super admin account...");
  try {
    await api("POST", "/api/auth/setup/create-admin", ADMIN);
    ok(`Admin created: ${ADMIN.username}`);
  } catch (e) {
    if (e.message.includes("already") || e.message.includes("exists")) {
      warn("Admin already exists, skipping");
    } else {
      throw e;
    }
  }

  // Step 2: Login as admin
  log("Logging in as admin...");
  const loginRes = await api("POST", "/api/auth/login", {
    username: ADMIN.username,
    password: ADMIN.password,
  });
  const token = loginRes.data.token;
  ok("Logged in");

  // Step 3: Create client user
  log("Creating client user...");
  let clientUserId;
  try {
    const userRes = await api("POST", "/api/users", CLIENT, token);
    clientUserId = userRes.data.id;
    ok(`Client user created: ${CLIENT.username} (${clientUserId})`);
  } catch (e) {
    if (e.message.includes("already") || e.message.includes("exists") || e.message.includes("duplicate")) {
      warn("Client user may already exist, attempting to find ID...");
      // List users to find the existing one
      const listRes = await api("GET", "/api/users", null, token);
      const existing = listRes.data?.find(
        (u) => u.username === CLIENT.username
      );
      if (existing) {
        clientUserId = existing.id;
        ok(`Found existing client user: ${clientUserId}`);
      } else {
        throw new Error("Could not find existing client user");
      }
    } else {
      throw e;
    }
  }

  // Step 4: Create servers
  const serverIds = [];
  for (const server of SERVERS) {
    log(`Creating server: ${server.name}...`);
    try {
      const res = await api("POST", "/api/admin/servers", server, token);
      serverIds.push(res.data.id);
      ok(`Server created: ${server.name} (${res.data.id})`);
    } catch (e) {
      if (e.message.includes("already") || e.message.includes("exists") || e.message.includes("duplicate")) {
        warn(`${server.name} may already exist, skipping`);
        // Try to find the server in the list
        const listRes = await api("GET", "/api/admin/servers", null, token);
        const existing = listRes.data?.find((s) => s.name === server.name);
        if (existing) {
          serverIds.push(existing.id);
          ok(`Found existing server: ${existing.id}`);
        }
      } else {
        throw e;
      }
    }
  }

  // Step 5: Grant client user access to all servers
  if (clientUserId && serverIds.length > 0) {
    for (const serverId of serverIds) {
      log(`Granting access to server ${serverId}...`);
      try {
        await api(
          "POST",
          `/api/admin/servers/${serverId}/access/user`,
          { userId: clientUserId },
          token
        );
        ok("Access granted");
      } catch (e) {
        if (e.message.includes("already") || e.message.includes("exists") || e.message.includes("duplicate")) {
          warn("Access already granted, skipping");
        } else {
          // Non-fatal — log and continue
          warn(`Could not grant access: ${e.message}`);
        }
      }
    }
  }

  console.log("\n✓ Demo data seeding complete!\n");
  console.log("  Auditor login:  admin / DemoAdmin123!");
  console.log("  Client login:   demo  / DemoUser123!");
  console.log(`  Backend:        ${BACKEND_URL}`);
  console.log("");
}

main().catch((err) => {
  console.error(`\n✗ Seed failed: ${err.message}\n`);
  process.exit(1);
});
