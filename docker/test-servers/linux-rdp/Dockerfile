# Linux RDP Test Server with xRDP for SmartAudit
# Ubuntu with XFCE desktop and xRDP server
# Allows RDP protocol testing without Windows licensing

FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Install XFCE desktop and xRDP
RUN apt-get update && apt-get install -y \
    xfce4 \
    xfce4-goodies \
    xrdp \
    xorgxrdp \
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

# Configure xRDP
RUN sed -i 's/port=3389/port=3389/' /etc/xrdp/xrdp.ini \
    && sed -i 's/max_bpp=32/max_bpp=24/' /etc/xrdp/xrdp.ini \
    && echo "xfce4-session" > /home/testuser/.xsession \
    && chown testuser:testuser /home/testuser/.xsession

# Fix xRDP session issues
RUN echo '#!/bin/bash\n\
unset DBUS_SESSION_BUS_ADDRESS\n\
unset XDG_RUNTIME_DIR\n\
exec startxfce4' > /etc/xrdp/startwm.sh \
    && chmod +x /etc/xrdp/startwm.sh

# Create startup script
RUN echo '#!/bin/bash\n\
rm -f /var/run/xrdp/xrdp.pid\n\
rm -f /var/run/xrdp/xrdp-sesman.pid\n\
service dbus start\n\
/usr/sbin/xrdp-sesman --nodaemon &\n\
exec /usr/sbin/xrdp --nodaemon' > /start-xrdp.sh \
    && chmod +x /start-xrdp.sh

# Create some test files
RUN mkdir -p /home/testuser/Desktop /home/testuser/Documents \
    && echo "Welcome to SmartAudit RDP Test Server" > /home/testuser/Desktop/welcome.txt \
    && chown -R testuser:testuser /home/testuser

EXPOSE 3389

CMD ["/start-xrdp.sh"]
