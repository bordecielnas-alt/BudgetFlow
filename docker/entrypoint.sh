#!/bin/sh
set -e

DATA_DIR="${DATA_DIR:-/data}"
CONFIG_DIR="$DATA_DIR/config"
CONFIG_FILE="$CONFIG_DIR/database.env"
APP_UID="${APP_UID:-1000}"
APP_GID="${APP_GID:-1000}"

# --- 0. Droits du volume monté (nécessite root au démarrage) ------------------
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"
  chown -R "$APP_UID:$APP_GID" "$DATA_DIR" 2>/dev/null || \
    echo "[init] Avertissement : impossible de corriger les droits de $DATA_DIR"
  # on relance ce script sans privilèges
  exec su-exec "$APP_UID:$APP_GID" "$0" "$@"
fi

# --- 1. Initialisation de l'arborescence persistante -------------------------
if ! mkdir -p "$CONFIG_DIR" "$DATA_DIR/exports" "$DATA_DIR/backups" "$DATA_DIR/cache"; then
  echo "----------------------------------------------------------------"
  echo "[erreur] Écriture impossible dans $DATA_DIR (droits du volume hôte)."
  echo "Sur l'hôte : sudo chown -R $APP_UID:$APP_GID ./data"
  echo "----------------------------------------------------------------"
  exit 1
fi


# --- 2. Fichier de configuration applicative (cree au premier demarrage) ------
if [ ! -f "$CONFIG_FILE" ]; then
  cat > "$CONFIG_FILE" <<'EOF2'
# BudgetFlow - configuration applicative
# Fichier persistant : monte depuis l'hote (./data/config/database.env)
# Aucune base externe n'est requise : les donnees sont stockees dans $DATA_DIR/budget.db
# (ou budget.json en repli). Ce fichier sert aux reglages optionnels.

# Port d'ecoute interne (defaut 3000)
# PORT=3000
EOF2
  chmod 600 "$CONFIG_FILE" 2>/dev/null || true
  echo "[init] Fichier de configuration cree : $CONFIG_FILE"
fi

# --- 3. Chargement : le fichier persistant ne remplace pas l'env explicite ----
while IFS='=' read -r key value; do
  case "$key" in
    ''|\#*) continue ;;
  esac
  current="$(printenv "$key" 2>/dev/null || true)"
  if [ -z "$current" ] && [ -n "$value" ]; then
    export "$key=$value"
  fi
done < "$CONFIG_FILE"

echo "[init] DATA_DIR=$DATA_DIR | stockage local : $DATA_DIR/budget.db"

if [ ! -f "/app/.output/server/index.mjs" ]; then
  echo "[erreur] Build serveur absente (/app/.output/server/index.mjs)."
  echo "Reconstruisez l'image : docker compose build --no-cache && docker compose up -d"
  exit 1
fi

echo "[init] Demarrage du serveur sur le port ${PORT:-3000}"
exec "$@"
