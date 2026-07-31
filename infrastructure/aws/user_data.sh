#!/bin/bash
# OGA LMS EC2 Provisioning Script
yum update -y
curl -sL https://rpm.nodesource.com/setup_18.x | bash -
yum install -y nodejs python3 git nginx

# Clone Code & Build App
cd /home/ec2-user
git clone https://github.com/ceortpsc/ourgray.git
cd ourgray
npm install
npm run build

# Enable & Start Background Worker
cp infrastructure/systemd/oga-worker.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now oga-worker
systemctl enable --now nginx
