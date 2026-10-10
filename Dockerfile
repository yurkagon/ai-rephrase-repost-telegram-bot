FROM node:24-alpine AS build
RUN apk add --no-cache openssl && corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/client/package.json apps/client/package.json
RUN HUSKY=0 pnpm install --frozen-lockfile
COPY . .
RUN DATABASE_URL=postgresql://postgres:postgres@localhost:5432/build pnpm db:generate && pnpm -r build

FROM node:24-alpine
RUN apk add --no-cache openssl && corepack enable
WORKDIR /app
COPY --from=build --chown=node:node /app /app
ENV NODE_ENV=production PORT=3000 CLIENT_DIST_PATH=/app/apps/client/dist
USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/src/main.js"]
