FROM nginx:1.27-alpine
COPY index.html privacy.html imprint.html analytics.js /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/conf.d/default.conf
