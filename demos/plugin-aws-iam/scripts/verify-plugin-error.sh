#!/bin/bash
set -euo pipefail

# Simulate a CI environment with no AWS credentials or config.
export AWS_CONFIG_FILE=/dev/null
export AWS_SHARED_CREDENTIALS_FILE=/dev/null
export AWS_EC2_METADATA_DISABLED=true
unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN AWS_PROFILE 2>/dev/null || true

# Force a deterministic local connection target so the plugin fails fast on
# missing IAM credentials instead of depending on any developer-specific .env.
export SAFEQL_DATABASE_HOST=localhost
export SAFEQL_DATABASE_PORT=5432
export SAFEQL_DATABASE_USER=postgres
export SAFEQL_DATABASE_NAME=postgres
export SAFEQL_AWS_REGION=us-east-1
export SAFEQL_AWS_PROFILE=safeql-missing-profile

output=$(pnpm exec eslint src 2>&1 || true)

echo "$output"

echo "$output" | grep -q '\[safeql-plugin-aws-iam\]'   || { echo "FAIL: plugin error prefix missing"; exit 1; }
! echo "$output" | grep -q 'Internal error'            || { echo "FAIL: got Internal error"; exit 1; }
! echo "$output" | grep -q 'could not be loaded'       || { echo "FAIL: plugin failed to load"; exit 1; }

echo "OK: plugin loaded, failed with expected plugin error"
