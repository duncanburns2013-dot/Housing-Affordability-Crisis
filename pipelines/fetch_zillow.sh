#!/usr/bin/env bash
# Refresh raw Zillow CSVs. Run from repo root: bash pipelines/fetch_zillow.sh
set -euo pipefail
mkdir -p data/raw

curl -sS -o data/raw/State_zhvi.csv \
  "https://files.zillowstatic.com/research/public_csvs/zhvi/State_zhvi_uc_sfrcondo_tier_0.33_0.67_sm_sa_month.csv"

curl -sS -o data/raw/State_invt_fs.csv \
  "https://files.zillowstatic.com/research/public_csvs/invt_fs/State_invt_fs_uc_sfrcondo_sm_month.csv"

echo "Zillow raw CSVs updated."
echo "Next: node pipelines/process_zillow.js"
