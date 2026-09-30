# Étape 1 : compilation du front Vue
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY vite.config.js ./
COPY client ./client
RUN npm run build

# Étape 2 : image finale, uniquement le serveur Express et le front compilé
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY drizzle ./drizzle
COPY --from=build /app/dist ./dist

ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION PORT=3000
EXPOSE 3000
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:3000/api/health || exit 1
CMD ["node", "server/index.js"]
