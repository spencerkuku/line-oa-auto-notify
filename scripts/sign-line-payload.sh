#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <LINE_CHANNEL_SECRET> <payload-file>"
  exit 1
fi

secret="$1"
payload_file="$2"

if [[ ! -f "$payload_file" ]]; then
  echo "Payload file not found: $payload_file"
  exit 1
fi

openssl dgst -sha256 -hmac "$secret" -binary "$payload_file" | openssl base64
