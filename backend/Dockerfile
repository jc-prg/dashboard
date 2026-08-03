FROM node:20-alpine
RUN apk add --no-cache docker-cli docker-cli-compose
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --omit=dev
COPY src ./src
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
EXPOSE 3001
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "src/index.js"]
