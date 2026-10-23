#!/bin/bash
cd ~/workin-api || exit 1
php ~/entrega_verificar2.php 2>&1
echo "== 5. Sitio y errores ==" 
echo "  API /up -> $(curl -s -A 'Mozilla/5.0' -o /dev/null -w '%{http_code}' --max-time 15 https://api-workin.otecnya.cl/up)"
echo "  Web -> $(curl -s -A 'Mozilla/5.0' -o /dev/null -w '%{http_code}' --max-time 15 https://workin.otecnya.cl/)"
echo "  Archivos de la web: $(curl -s -A 'Mozilla/5.0' --max-time 15 https://workin.otecnya.cl/ | grep -o 'assets/index-[A-Za-z0-9_-]*\.js' | head -1)  (esperado: assets/index-DZT1J9VI.js)"
echo "  Errores en el log de hoy:"
grep -E "^\[$(date +%F)" storage/logs/laravel.log 2>/dev/null | grep -E "ERROR|CRITICAL" | tail -5 | cut -c1-220
echo "  (fin del log)"
echo "  SQL aplicados por el despliegue:"; cat ~/backups/sql-aplicados.txt 2>/dev/null | sed 's/^/    /'
rm -f ~/entrega_verificar2.php
echo "== 6. Diagnostico del despliegue =="
echo "  ~/entrega ahora:"; ls -la ~/entrega 2>&1 | tail -8 | sed 's/^/    /'
echo "  ~/entregado (ultimas):"; for d in $(ls -d ~/entregado/* 2>/dev/null | tail -2); do echo "    $d:"; ls -la "$d" | tail -8 | sed 's/^/      /'; done
echo "  ~/backups:"; ls -la ~/backups 2>&1 | tail -12 | sed 's/^/    /'
echo "  index.html de la web:"; grep -o 'assets/index-[A-Za-z0-9_-]*\.js' ~/public_html/workin/index.html | sed 's/^/    /'
