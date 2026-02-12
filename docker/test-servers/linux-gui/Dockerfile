# Linux GUI Test Server with VNC for SmartAudit
# Ubuntu with XFCE desktop and TigerVNC server

FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV USER=testuser
ENV VNC_PASSWORD=testpass
ENV VNC_RESOLUTION=1280x720
ENV VNC_DEPTH=24

# Install XFCE desktop and VNC server
RUN apt-get update && apt-get install -y \
    xfce4 \
    xfce4-goodies \
    tigervnc-standalone-server \
    tigervnc-common \
    dbus-x11 \
    sudo \
    vim \
    nano \
    curl \
    wget \
    net-tools \
    iputils-ping \
    htop \
    firefox \
    xterm \
    && rm -rf /var/lib/apt/lists/*

# Create test user with sudo access
RUN useradd -m -s /bin/bash testuser \
    && echo 'testuser:testpass' | chpasswd \
    && usermod -aG sudo testuser \
    && echo 'testuser ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers

# Setup VNC for testuser
RUN mkdir -p /home/testuser/.vnc \
    && echo "$VNC_PASSWORD" | vncpasswd -f > /home/testuser/.vnc/passwd \
    && chmod 600 /home/testuser/.vnc/passwd \
    && chown -R testuser:testuser /home/testuser/.vnc

# Create xstartup script
RUN echo '#!/bin/bash\n\
unset SESSION_MANAGER\n\
unset DBUS_SESSION_BUS_ADDRESS\n\
export XKL_XMODMAP_DISABLE=1\n\
exec startxfce4' > /home/testuser/.vnc/xstartup \
    && chmod +x /home/testuser/.vnc/xstartup \
    && chown testuser:testuser /home/testuser/.vnc/xstartup

# Create startup script
RUN echo '#!/bin/bash\n\
rm -f /tmp/.X*-lock /tmp/.X11-unix/X*\n\
su - testuser -c "vncserver :0 -geometry $VNC_RESOLUTION -depth $VNC_DEPTH -localhost no"\n\
tail -f /home/testuser/.vnc/*.log' > /start-vnc.sh \
    && chmod +x /start-vnc.sh

# Create some test files
RUN mkdir -p /home/testuser/Desktop /home/testuser/Documents \
    && echo "Welcome to SmartAudit VNC Test Server" > /home/testuser/Desktop/welcome.txt \
    && chown -R testuser:testuser /home/testuser

EXPOSE 5900

CMD ["/start-vnc.sh"]
