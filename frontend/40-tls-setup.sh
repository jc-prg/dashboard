#!/bin/sh
# Runs before nginx starts (via /docker-entrypoint.d/).
# Selects the HTTP or HTTPS nginx config based on whether TLS certs are present.
set -e

CERT="${TLS_CERT:-/etc/nginx/certs/cert.pem}"
KEY="${TLS_KEY:-/etc/nginx/certs/key.pem}"

if [ -f "$CERT" ] && [ -f "$KEY" ]; then
    echo "[tls-setup] Certificates found — enabling HTTPS with HTTP redirect"
    # If the user mounted certs at a non-default path, symlink to expected location
    if [ "$CERT" != "/etc/nginx/certs/cert.pem" ]; then
        mkdir -p /etc/nginx/certs
        ln -sf "$CERT" /etc/nginx/certs/cert.pem
        ln -sf "$KEY"  /etc/nginx/certs/key.pem
    fi
    cp /etc/nginx/available/https.conf /etc/nginx/conf.d/default.conf
else
    echo "[tls-setup] No TLS certificates found — serving HTTP only"
    echo "[tls-setup] Place cert.pem + key.pem in config/certs/ to enable HTTPS"
    cp /etc/nginx/available/http.conf /etc/nginx/conf.d/default.conf
fi
