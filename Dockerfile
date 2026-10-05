# syntax=docker/dockerfile:1

# --- Stage 1: type-check and build the Vite client ---
FROM node:22.23-alpine AS build
WORKDIR /app

# Install dependencies first for better layer caching
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- Stage 2: run the Express + WebSocket server ---
FROM node:22.23-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Production dependencies only (no Vite, TypeScript or ESLint)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Node runs the server's TypeScript sources directly, so there is no server build step.
COPY server ./server
COPY shared ./shared
COPY --from=build /app/dist ./dist

EXPOSE 3000
USER node
CMD ["node", "server/server.ts"]
