#!/usr/bin/env bash
# The pack's demo: the official full-stack FastAPI template at its release TEMPLATE_VERSION (0.12.0), as it ships,
# built and started on Docker Compose (.github/demo/compose.yml) in demo-app/: the app on 127.0.0.1:${PORT:-8501}, its
# mail catcher's page on 127.0.0.1:${MAIL_PORT:-8525}. Then its migrations and first superuser (the template's
# prestart.sh), and a normal account the scenarios name "user", made through the API.
#
# The accounts' passwords come from the environment, as the suite reads them:
#   FASTAPI_ADMIN_PASSWORD   the first superuser, admin@example.com ("admin")
#   FASTAPI_USER_PASSWORD    a normal account, user@example.com ("user")
#
#   FASTAPI_ADMIN_PASSWORD=… FASTAPI_USER_PASSWORD=… bash .github/scripts/build-demo.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEMPLATE_VERSION="${TEMPLATE_VERSION:-0.12.0}"
APP="${ROOT}/demo-app"
PORT="${PORT:-8501}"
MAIL_PORT="${MAIL_PORT:-8525}"
: "${FASTAPI_ADMIN_PASSWORD:?Set FASTAPI_ADMIN_PASSWORD, the password of the demo's first superuser.}"
: "${FASTAPI_USER_PASSWORD:?Set FASTAPI_USER_PASSWORD, the password of the demo's normal account.}"
ADMIN="${FASTAPI_ADMIN_USERNAME:-admin@example.com}"
USER_NAME="${FASTAPI_USER_USERNAME:-user@example.com}"

if [ ! -d "${APP}/backend" ]; then
  echo "Taking the full-stack FastAPI template ${TEMPLATE_VERSION}."
  git clone --quiet --depth 1 --branch "${TEMPLATE_VERSION}" https://github.com/fastapi/full-stack-fastapi-template.git "${APP}"
fi
cp "${ROOT}/.github/demo/compose.yml" "${APP}/compose.webship.yml"

# The settings, written once: a secret key and a database password of its own, the accounts from the environment.
ENVF="${APP}/.env.webship"
if [ ! -f "${ENVF}" ]; then
  umask 077
  {
    echo "PROJECT_NAME=Full Stack FastAPI Project"
    echo "SECRET_KEY=$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')"
    echo "POSTGRES_PASSWORD=$(python3 -c 'import secrets; print(secrets.token_urlsafe(18))')"
    echo "FIRST_SUPERUSER=${ADMIN}"
    echo "FIRST_SUPERUSER_PASSWORD=${FASTAPI_ADMIN_PASSWORD}"
    echo "PORT=${PORT}"
    echo "MAIL_PORT=${MAIL_PORT}"
  } > "${ENVF}"
fi

cd "${APP}"
dc() { docker compose -f compose.webship.yml --env-file "${ENVF}" "$@"; }
echo "Building the app's image (the template's backend/Dockerfile)."
dc build backend
dc up -d db mail
echo "Migrations and the first superuser (the template's prestart.sh)."
dc run --rm -T backend bash scripts/prestart.sh
dc up -d backend
for i in $(seq 1 60); do
  if curl -fsS -o /dev/null "http://127.0.0.1:${PORT}/api/v1/utils/health-check/"; then break; fi
  if [ "${i}" = 60 ]; then echo "The demo did not answer on 127.0.0.1:${PORT}." >&2; dc logs backend >&2; exit 1; fi
  sleep 2
done

# The normal account, made through the API by the first superuser (once: the API refuses an address it has).
TOKEN=$(curl -fsS -X POST "http://127.0.0.1:${PORT}/api/v1/login/access-token" \
  --data-urlencode "username=${ADMIN}" --data-urlencode "password=${FASTAPI_ADMIN_PASSWORD}" \
  | python3 -c 'import json, sys; print(json.load(sys.stdin)["access_token"])')
BODY=$(USER_NAME="${USER_NAME}" python3 -c 'import json, os; print(json.dumps({"email": os.environ["USER_NAME"], "password": os.environ["FASTAPI_USER_PASSWORD"], "full_name": "Webship user", "is_active": True, "is_superuser": False}))')
STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:${PORT}/api/v1/users/" \
  -H "Authorization: Bearer ${TOKEN}" -H 'Content-Type: application/json' --data "${BODY}")
case "${STATUS}" in
  200) echo "Made the normal account ${USER_NAME}." ;;
  400) echo "The normal account ${USER_NAME} is there already." ;;
  *) echo "The API answered ${STATUS} to making the normal account." >&2; exit 1 ;;
esac
echo "The demo is up: http://127.0.0.1:${PORT} (the docs at /docs, the mail catcher at http://127.0.0.1:${MAIL_PORT})."
