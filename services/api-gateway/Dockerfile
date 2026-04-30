FROM node:20-alpine AS base
RUN npm install -g pnpm@9

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY services/api-gateway/package.json ./services/api-gateway/
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared-types/node_modules ./packages/shared-types/node_modules
COPY --from=deps /app/services/api-gateway/node_modules ./services/api-gateway/node_modules
COPY tsconfig.base.json ./
COPY packages/shared-types ./packages/shared-types
COPY services/api-gateway ./services/api-gateway
RUN cd services/api-gateway && pnpm build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/services/api-gateway/dist ./dist
COPY --from=builder /app/services/api-gateway/node_modules ./node_modules

EXPOSE 3000
CMD ["node", "dist/index.js"]
