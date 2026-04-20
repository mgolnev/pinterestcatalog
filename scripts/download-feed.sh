#!/usr/bin/env sh
set -eu
FEED_URL="${FEED_URL:-https://storage-cdn11.gloria-jeans.ru/catalog/feeds/auto-merch/auto-merch-feed-cc-central.xml}"
OUT="${1:-data/downloaded-feed.xml}"
mkdir -p "$(dirname "$OUT")"
echo "Downloading $FEED_URL -> $OUT"
curl -fsSL -o "$OUT" "$FEED_URL"
echo "OK ($(wc -c < "$OUT") bytes)"
