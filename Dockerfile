FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
COPY server/package*.json server/
COPY client/package*.json client/

RUN npm ci && npm ci --prefix server && npm ci --prefix client

COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/server/package*.json ./server/
RUN npm ci --omit=dev --prefix server

COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/assets ./assets
COPY --from=build /app/.env.example ./.env.example

EXPOSE 8080
CMD ["node", "server/dist/index.js"]
