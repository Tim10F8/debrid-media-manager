#!/bin/bash
# Check a Real-Debrid download code against all 23 stream server locations.
# Usage: ./scripts/check-rd-hosts.sh <download_code>
# Example: ./scripts/check-rd-hosts.sh J2RDJR7T7AV3S

set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: $0 <download_code>"
  echo "Example: $0 J2RDJR7T7AV3S"
  exit 1
fi

CODE="$1"
TIMEOUT=2
LOCATIONS=(
  rbx akl1 bgt1 chi1 dal1 den1 fjr1 hkg1 jnb1 kul1 lax1 mia1
  mum1 nyk1 qro1 sao1 scl1 sea1 sgp1 syd1 tlv1 tyo1
)

printf "%-8s %-40s %s\n" "CODE" "HOST" "STATUS"
printf "%-8s %-40s %s\n" "--------" "----------------------------------------" "------"

for loc in "${LOCATIONS[@]}"; do
  host="${loc}.download.real-debrid.com"
  url="https://${host}/d/${CODE}/"
  status=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" "$url" 2>/dev/null || echo "ERR")
  printf "%-8s %-40s %s\n" "$loc" "$host" "$status"
done
