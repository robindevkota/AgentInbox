FROM node:20-alpine
RUN npm install -g pnpm@9.0.0

WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/server/package.json ./packages/server/
COPY packages/ui/package.json ./packages/ui/
RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter=ui build \
 && pnpm --filter=server build \
 && node packages/server/scripts/copy-ui.js

RUN mkdir -p /data

ENV PORT=3000
ENV DATA_DIR=/data
EXPOSE 3000

CMD ["node", "packages/server/dist/cli.js", "start"]
