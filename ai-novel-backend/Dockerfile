FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production=false && npm cache clean --force
COPY tsconfig.json drizzle.config.ts ./
COPY src/ ./src/
EXPOSE 3000
CMD ["node", "--import", "tsx", "src/app.ts"]
