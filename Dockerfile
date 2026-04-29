FROM node:20-alpine AS base
RUN npm install -g pnpm@9.0.0

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/server/package.json ./packages/server/
COPY packages/ui/package.json ./packages/ui/
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/server/node_modules ./packages/server/node_modules
COPY --from=deps /app/packages/ui/node_modules ./packages/ui/node_modules
COPY . .
RUN pnpm --filter=ui build && pnpm --filter=server build && node packages/server/scripts/copy-ui.js

FROM node:20-alpine AS runner
WORKDIR /app
RUN npm install -g pnpm@9.0.0
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/server/package.json ./packages/server/
RUN pnpm install --prod --frozen-lockfile

COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /app/packages/server/ui-dist ./packages/server/ui-dist

RUN mkdir -p /data

ENV PORT=3000
ENV DATA_DIR=/data
EXPOSE 3000

CMD ["node", "packages/server/dist/cli.js", "start"]
