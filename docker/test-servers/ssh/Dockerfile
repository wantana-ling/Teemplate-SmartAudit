# SSH Test Server for SmartAudit
# Ubuntu with SSH server for terminal session testing

FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Install SSH server and utilities
RUN apt-get update && apt-get install -y \
    openssh-server \
    sudo \
    vim \
    nano \
    curl \
    wget \
    net-tools \
    iputils-ping \
    htop \
    && rm -rf /var/lib/apt/lists/*

# Create SSH directory
RUN mkdir -p /run/sshd

# Create test user with sudo access
RUN useradd -m -s /bin/bash testuser \
    && echo 'testuser:testpass' | chpasswd \
    && usermod -aG sudo testuser \
    && echo 'testuser ALL=(ALL) NOPASSWD:ALL' >> /etc/sudoers

# Configure SSH
RUN sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin no/' /etc/ssh/sshd_config \
    && sed -i 's/#PasswordAuthentication yes/PasswordAuthentication yes/' /etc/ssh/sshd_config \
    && sed -i 's/#PubkeyAuthentication yes/PubkeyAuthentication yes/' /etc/ssh/sshd_config

# Create some test files and directories
RUN mkdir -p /home/testuser/documents /home/testuser/projects \
    && echo "Welcome to SmartAudit SSH Test Server" > /home/testuser/welcome.txt \
    && echo "This is a test document" > /home/testuser/documents/test.txt \
    && chown -R testuser:testuser /home/testuser

EXPOSE 22

CMD ["/usr/sbin/sshd", "-D"]
