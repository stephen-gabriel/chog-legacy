# Build stage: full install, compile client + server bundle
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY server ./server
COPY db ./db
RUN npm run typecheck && npx vite build && npm run build:server

# Runtime stage: production dependencies only
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV API_PORT=8080
ENV HOST=0.0.0.0
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
COPY db/migrations ./db/migrations
EXPOSE 8080
CMD ["sh", "-c", "node dist-server/main.js"]
