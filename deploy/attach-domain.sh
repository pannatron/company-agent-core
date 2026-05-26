#!/usr/bin/env bash
# Attach a domain to the company-agent dashboard.
# Usage: ./attach-domain.sh agent.example.com
set -euo pipefail

DOMAIN="${1:-}"
if [[ -z "$DOMAIN" ]]; then
  echo "usage: $0 <domain>"
  exit 1
fi

SRC="$(cd "$(dirname "$0")" && pwd)/traefik-company-agent.yaml"
TMP="$(mktemp)"
sed "s/__DOMAIN__/${DOMAIN}/g" "$SRC" > "$TMP"

docker cp "$TMP" coolify-proxy:/traefik/dynamic/company-agent.yaml
rm -f "$TMP"

echo "Installed Traefik route for ${DOMAIN} -> http://10.0.1.1:3508"
echo "Point ${DOMAIN} DNS A record to this host's public IP."
echo "Traefik will request a Let's Encrypt cert on first hit."
