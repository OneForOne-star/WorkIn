#!/bin/bash
# Configura el correo (Brevo) en el .env del servidor. Los datos llegan por stdin, no quedan en archivos.
set -euo pipefail
read -r SMTP_USER; read -r SMTP_PASS; read -r TESTTO
cd ~/workin-api
mkdir -p ~/backups
cp .env ~/backups/env-$(date +%F-%H%M).bak
upd(){ KEY="$1" VAL="$2" awk 'BEGIN{k=ENVIRON["KEY"];v=ENVIRON["VAL"];f=0} index($0,k"=")==1 {print k"="v; f=1; next} {print} END{if(!f) print k"="v}' .env > .env.new && cat .env.new > .env && rm -f .env.new; }
upd MAIL_MAILER smtp
upd MAIL_HOST smtp-relay.brevo.com
upd MAIL_PORT 587
upd MAIL_USERNAME "\"$SMTP_USER\""
upd MAIL_PASSWORD "\"$SMTP_PASS\""
upd MAIL_FROM_ADDRESS "\"notificaciones@otecnya.cl\""
upd MAIL_FROM_NAME "\"WorkIn\""
php artisan config:clear >/dev/null
echo "OK  .env actualizado (respaldo en ~/backups). Enviando prueba a $TESTTO ..."
export TESTTO
php artisan tinker --execute='Mail::raw("Si lees esto, el correo de WorkIn funciona.", function ($m) { $m->to(getenv("TESTTO"))->subject("Prueba de WorkIn"); }); echo "ENVIADO sin errores\n";'
