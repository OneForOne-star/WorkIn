#!/bin/bash
# WorkIn - despliegue en el servidor. Lo ejecuta desplegar.ps1 (no hace falta correrlo a mano).
set -euo pipefail
shopt -s nullglob
E=~/entrega; API=~/workin-api; WEB=~/public_html/workin; BK=~/backups
TS=$(date +%F-%H%M)
mkdir -p "$BK"
echo "== WorkIn · despliegue $TS =="

getenv(){ grep -E "^$1=" "$API/.env" | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"; }

# 1) SQL (primero, con respaldo de la base)
SQLS=("$E"/*.sql)
if [ ${#SQLS[@]} -gt 0 ]; then
  export MYSQL_PWD="$(getenv DB_PASSWORD)"
  U=$(getenv DB_USERNAME); D=$(getenv DB_DATABASE); H=$(getenv DB_HOST); H=${H:-localhost}
  OUT="$BK/db-$TS.sql.gz"
  mysqldump --no-tablespaces -h "$H" -u "$U" "$D" | gzip > "$OUT"
  [ "$(stat -c %s "$OUT")" -gt 1000 ] || { echo "ERROR: respaldo de la base vacio. No se aplica nada."; exit 1; }
  echo "OK  respaldo de la base: $OUT"
  touch "$BK/sql-aplicados.txt"
  echo "--  ${#SQLS[@]} archivo(s) SQL en la entrega"
  for f in "${SQLS[@]}"; do
    n=$(basename "$f")
    if grep -qxF "$n" "$BK/sql-aplicados.txt"; then echo "--  $n ya estaba aplicado, se salta"; continue; fi
    mysql -h "$H" -u "$U" "$D" < "$f"
    echo "$n" >> "$BK/sql-aplicados.txt"
    echo "OK  SQL aplicado: $n"
  done
fi

# 2) Backend
if [ -f "$E/backend.zip" ]; then
  tar czf "$BK/api-$TS.tar.gz" -C "$API" --exclude=vendor --exclude=storage/logs --exclude=storage/framework .
  echo "OK  respaldo del codigo: $BK/api-$TS.tar.gz"
  T=$(mktemp -d); unzip -q "$E/backend.zip" -d "$T"
  if find "$T" -name '.env' | grep -q .; then echo "ERROR: el zip trae un .env. No se copia nada."; exit 1; fi
  bad=0
  for p in $(find "$T" -name '*.php'); do php -l "$p" >/dev/null 2>&1 || { echo "Sintaxis invalida: $p"; bad=1; }; done
  [ "$bad" = 0 ] || { echo "ERROR: hay PHP con errores. No se copia nada."; exit 1; }
  cp -r "$T"/. "$API"/
  chmod 755 "$API"
  if [ -f "$T/composer.lock" ]; then (cd "$API" && composer install --no-dev --optimize-autoloader --no-interaction); fi
  (cd "$API" && php artisan optimize:clear >/dev/null && echo "OK  backend copiado y cache limpia")
  rm -rf "$T"
fi

# 3) Frontend
if [ -f "$E/web.zip" ]; then
  tar czf "$BK/web-$TS.tar.gz" -C "$WEB" .
  echo "OK  respaldo del frontend: $BK/web-$TS.tar.gz"
  T=$(mktemp -d); unzip -q "$E/web.zip" -d "$T"
  [ -f "$T/index.html" ] || { echo "ERROR: web.zip no tiene index.html. No se cambia nada."; exit 1; }
  find "$WEB" -mindepth 1 -delete
  cp -r "$T"/. "$WEB"/
  chmod 755 "$WEB"; find "$WEB" -type d -exec chmod 755 {} +; find "$WEB" -type f -exec chmod 644 {} +
  rm -rf "$T"
  echo "OK  frontend reemplazado"
fi

# 4) Comandos extra (el script los muestra y pide confirmacion antes)
if [ -f "$E/post.sh" ]; then
  echo "== post.sh =="
  (cd "$API" && bash "$E/post.sh")
fi

# 5) Verificacion
A=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 https://api-workin.otecnya.cl/up || true)
W=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 https://workin.otecnya.cl/ || true)
echo "== Verificacion: API=$A  Web=$W (200 es correcto) =="

mkdir -p ~/entregado/"$TS"
mv "$E"/* ~/entregado/"$TS"/ 2>/dev/null || true
echo "== Listo =="
