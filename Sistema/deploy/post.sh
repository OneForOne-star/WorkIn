# Instala el cron de Laravel (cada minuto) si no existe, y muestra las tareas programadas.
PHPBIN=$(command -v php)
LINEA="* * * * * cd $HOME/workin-api && $PHPBIN artisan schedule:run >> /dev/null 2>&1"
echo "PHP del cron: $PHPBIN ($($PHPBIN -r 'echo PHP_VERSION;'))"
if crontab -l 2>/dev/null | grep -q 'workin-api.*schedule:run'; then
  echo "El cron de WorkIn ya existia, no se cambia."
else
  ( crontab -l 2>/dev/null; echo "$LINEA" ) | crontab -
  echo "Cron de WorkIn agregado."
fi
echo "--- crontab actual (solo WorkIn) ---"
crontab -l | grep workin-api
echo "--- tareas programadas de la app ---"
$PHPBIN artisan schedule:list
