# SignX Reach — Production Deploy Runbook (Oracle Always-Free)

Target: the whole stack (API, worker, Postgres, Redis, web, TLS) on ONE
Oracle Cloud Always-Free ARM VM. Recurring cost: the domain (~$10–12/yr).
Everything else rides free tiers — total well under the $100/yr budget
(docs/07).

## 0. What you need before starting
- An Oracle Cloud account (free tier — needs a credit card for identity,
  it is not charged).
- A domain (e.g. from Namecheap/Porkbun, ~$10/yr).
- Free-tier SMTP creds for platform mail: Brevo (300 mails/day) or
  Resend (100/day).
- Optional: Cloudflare account (free) for R2 offsite backups (10 GB) and
  DNS; Sentry free tier for error alerts.

## 1. Create the VM (Oracle console — human step)
1. Compute → Instances → Create instance.
2. Image: **Ubuntu 22.04 (aarch64)**. Shape: **VM.Standard.A1.Flex** —
   4 OCPU / 24 GB RAM (the full Always-Free allowance; take all of it,
   it costs nothing).
3. Boot volume 100–200 GB (free tier includes 200 GB total block storage).
4. Add your SSH public key. Create.
5. Networking → the instance's VCN → Security List → add ingress rules
   for TCP **80** and **443** from 0.0.0.0/0 (22 is already open).

## 2. Prepare the VM
```bash
ssh ubuntu@<VM_PUBLIC_IP>

# Ubuntu's own firewall (iptables rules ship restrictive on Oracle):
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save

# Docker (official convenience script) + compose plugin:
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu && newgrp docker

sudo apt-get update && sudo apt-get install -y git rclone
```

## 3. DNS (human step)
Point an **A record** for your domain (e.g. `market.example.pk`) at the
VM's public IP. Wait until `dig +short market.example.pk` returns the IP
— Caddy needs this to issue the Let's Encrypt certificate.

## 4. Deploy
```bash
git clone https://github.com/abdulmannan002/lead-finder.git signx-reach
cd signx-reach

cp .env.production.example .env.production
nano .env.production   # fill DOMAIN, ACME_EMAIL, passwords, secrets, SMTP

docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```
The API container runs `prisma migrate deploy` before it starts, so the
schema is always current. First build on ARM takes a few minutes.

Verify:
```bash
docker compose -f docker-compose.prod.yml ps          # all Up
curl -s https://market.example.pk/api/v1/health || \
curl -si https://market.example.pk | head -1          # 200 from the web app
```
Then sign up the first workspace in the browser — that's your platform
tenant (SignX itself) for growth campaigns (MP-7).

## 5. Backups (NFR-8 + offsite)
```bash
# Optional offsite: configure an R2 remote once —
rclone config   # name: r2, type: s3, provider: Cloudflare, keys from R2 dashboard

# Nightly cron on the HOST (dumps through the postgres container):
crontab -e
# 15 2 * * * cd /home/ubuntu/signx-reach && docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U signx --no-owner --no-privileges signx_reach | gzip > /var/backups/signx-reach/signx-reach-$(date +\%Y\%m\%d).sql.gz && rclone copy /var/backups/signx-reach r2:signx-backups --min-age 0 || true
sudo mkdir -p /var/backups/signx-reach && sudo chown ubuntu /var/backups/signx-reach
```
Monthly restore drill: `gunzip -c <file> | docker compose -f docker-compose.prod.yml exec -T postgres psql -U signx -d postgres -c 'CREATE DATABASE signx_restore' && ... psql -U signx signx_restore`.

## 6. Updating
```bash
cd ~/signx-reach && git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
docker image prune -f
```
CI (GitHub Actions) runs lint + typecheck + unit + e2e + web build on
every push to main — only deploy green commits.

## 7. Free-tier ledger (why this stays under budget)
| Item | Provider | Cost |
|---|---|---|
| VM (4 OCPU ARM / 24 GB) | Oracle Always-Free | $0 |
| TLS certificates | Let's Encrypt via Caddy | $0 |
| Platform mail | Brevo/Resend free tier | $0 |
| Offsite backups (10 GB) | Cloudflare R2 free | $0 |
| Error tracking | Sentry free tier | $0 |
| CI | GitHub Actions free tier | $0 |
| AI descriptions | platform Anthropic key (haiku) | ~$1–5/yr at launch volume |
| Domain | registrar | ~$10–12/yr |

## 8. Known limits / later
- Single VM = single point of failure; acceptable at this stage. The
  nightly dump + R2 copy bounds data loss to one day.
- Outreach SMTP/IMAP (tenant mailboxes) are tenant-provided keys, not
  platform infrastructure — nothing to host.
- When traffic outgrows the VM: move Postgres to a managed instance
  first, keep the rest as-is.
