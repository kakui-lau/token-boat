#!/bin/sh

set -eu

dist_dir="${1:-web/dist}"

for required_file in \
  "index.html" \
  "404.html" \
  "legacy/index.html" \
  "console/index.html" \
  "en/index.html" \
  "en/404/index.html" \
  "ja/index.html" \
  "ja/404/index.html" \
  "ko/index.html" \
  "ko/404/index.html" \
  "zh-TW/index.html" \
  "zh-TW/404/index.html" \
  "robots.txt" \
  "sitemap.xml"; do
  if [ ! -s "${dist_dir}/${required_file}" ]; then
    echo "error: assembled web file is missing or empty: ${dist_dir}/${required_file}" >&2
    exit 1
  fi
done

for required_assets in "_astro" "static" "console/assets"; do
  if [ ! -d "${dist_dir}/${required_assets}" ]; then
    echo "error: assembled web asset directory is missing: ${dist_dir}/${required_assets}" >&2
    exit 1
  fi
  if [ -z "$(find "${dist_dir}/${required_assets}" -type f -print -quit)" ]; then
    echo "error: assembled web asset directory is empty: ${dist_dir}/${required_assets}" >&2
    exit 1
  fi
done

if [ -e "${dist_dir}/admin" ]; then
  echo "error: unfinished Admin V2 must not be present in the production bundle" >&2
  exit 1
fi

if cmp -s "${dist_dir}/index.html" "${dist_dir}/legacy/index.html"; then
  echo "error: public and legacy shells are identical; the Astro overlay was not assembled" >&2
  exit 1
fi

echo "web assembly verified: public site + /console + legacy /dashboard"
