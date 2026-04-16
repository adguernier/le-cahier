# Deploying Ethical Calc on a Raspberry Pi

## Prerequisites

- Raspberry Pi running Raspberry Pi OS (64-bit recommended)
- Node.js 20+ (install via nodesource or nvm)
- Git

## Setup

```bash
git clone <repo> /home/pi/ethical-calc
cd /home/pi/ethical-calc
npm ci
npm run db:migrate
npm run db:seed
npm run set-password -- "<password>"
npm run build
```

## systemd service

Create `/etc/systemd/system/ethical-calc.service`:

```
[Unit]
Description=Ethical Calc household app
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/home/pi/ethical-calc
EnvironmentFile=/home/pi/ethical-calc/.env
ExecStart=/usr/bin/node /home/pi/ethical-calc/build/server/index.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Enable:

```bash
sudo systemctl enable --now ethical-calc
sudo systemctl status ethical-calc
```

App available at `http://raspberrypi.local:3000` (mDNS) or the Pi's LAN IP.

## Backups

Daily backup via cron:

```bash
mkdir -p /home/pi/backups
crontab -e
# Add:
0 3 * * * sqlite3 /home/pi/ethical-calc/data/household.db ".backup /home/pi/backups/household-$(date +\%F).db"
```

Prune backups older than 30 days:

```bash
find /home/pi/backups -name "household-*.db" -mtime +30 -delete
```

## Updating

```bash
cd /home/pi/ethical-calc
git pull
npm ci
npm run db:migrate
npm run build
sudo systemctl restart ethical-calc
```
