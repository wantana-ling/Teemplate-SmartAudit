#!/usr/bin/env bash
# ============================================================================
# SmartAIAudit Demo Targets — Entrypoint
# Starts SSH, virtual framebuffer, XFCE desktop, x11vnc, and xRDP.
# ============================================================================
set -e

echo "▶ Starting SSH daemon..."
/usr/sbin/sshd

echo "▶ Starting Xvfb (virtual display :0)..."
rm -f /tmp/.X0-lock /tmp/.X11-unix/X0
Xvfb :0 -screen 0 1280x720x24 +extension GLX &
sleep 1

echo "▶ Starting XFCE desktop as testuser..."
export DISPLAY=:0
su - testuser -c "DISPLAY=:0 dbus-launch --exit-with-session xfce4-session" &
sleep 2

echo "▶ Starting x11vnc on port 5900..."
x11vnc -display :0 -forever -rfbport 5900 -passwd testpass -shared -noxdamage &

echo "▶ Starting xRDP on port 3389..."
# Clean stale pid files
rm -f /var/run/xrdp/xrdp.pid /var/run/xrdp/xrdp-sesman.pid
mkdir -p /var/run/xrdp

# Start dbus (required by xrdp-sesman)
service dbus start 2>/dev/null || true

/usr/sbin/xrdp-sesman &
exec /usr/sbin/xrdp --nodaemon
