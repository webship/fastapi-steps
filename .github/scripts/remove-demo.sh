#!/usr/bin/env bash
# Remove the demo build-demo.sh made: its containers and its database volume, the app's image it built, then
# demo-app/. The images it pulled (Postgres, the mail catcher) stay: other projects may use them.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP="${ROOT}/demo-app"
if [ -f "${APP}/compose.webship.yml" ] && [ -f "${APP}/.env.webship" ]; then
  (cd "${APP}" && docker compose -f compose.webship.yml --env-file .env.webship down -v)
fi
docker image rm -f fastapi-steps-demo-backend:0.12.0 > /dev/null 2>&1 || true
rm -rf "${APP:?}"
echo "The demo is removed."
