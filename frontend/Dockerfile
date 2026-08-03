FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf      /etc/nginx/available/http.conf
COPY nginx.https.conf /etc/nginx/available/https.conf
COPY 40-tls-setup.sh /docker-entrypoint.d/40-tls-setup.sh
RUN chmod +x /docker-entrypoint.d/40-tls-setup.sh \
    && rm -f /etc/nginx/conf.d/default.conf
EXPOSE 80 443
