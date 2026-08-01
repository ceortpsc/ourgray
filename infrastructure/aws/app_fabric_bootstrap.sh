#!/bin/bash
set -e
echo "🚀 Bootstrapping OGA LMS Enterprise Application Fabric Instance..."

# Update system & dependencies
yum update -y
curl -sL https://rpm.nodesource.com/setup_18.x | bash -
yum install -y nodejs python3 git nginx

# Sync application source
mkdir -p /home/ec2-user/ourgray
cd /home/ec2-user/ourgray
git clone https://github.com/ceortpsc/ourgray.git .
npm install
npm run build

# Install Nginx Enterprise Config
cp infrastructure/nginx/oga_app_fabric.conf /etc/nginx/conf.d/
rm -f /etc/nginx/conf.d/default.conf

# Install Systemd Daemons
cp infrastructure/systemd/oga-matrix-runner.service /etc/systemd/system/
cp infrastructure/systemd/oga-worker.service /etc/systemd/system/ 2>/dev/null || true

# Reload & Start Services
systemctl daemon-reload
systemctl enable --now nginx
systemctl enable --now oga-matrix-runner

echo "✅ Instance Application Fabric Provisioning Complete!"
