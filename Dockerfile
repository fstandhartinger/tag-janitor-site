FROM nginx:1.27-alpine
COPY index.html privacy.html imprint.html analytics.js favicon.svg robots.txt sitemap.xml llms.txt 4ab760cd5aef21fb28b299f6b38601be.txt /usr/share/nginx/html/
COPY assets/ /usr/share/nginx/html/assets/
COPY guides/ /usr/share/nginx/html/guides/
COPY nginx.conf /etc/nginx/conf.d/default.conf
