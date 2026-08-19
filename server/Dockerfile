FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 5000
CMD ["sh", "-c", "node db/migrate.js && node db/seed.js && node index.js"]
