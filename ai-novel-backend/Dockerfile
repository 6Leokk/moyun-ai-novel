FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
COPY drizzle.config.ts ./
RUN npm run build 2>/dev/null || true

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package*.json ./
COPY --from=build /app/drizzle.config.ts ./
COPY --from=build /app/src/db/migrations ./src/db/migrations

EXPOSE 3000
CMD ["node", "dist/app.js"]
