FROM node:20-alpine AS base
RUN npm install -g pnpm@9

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/db-schema/package.json ./packages/db-schema/
COPY services/notification-service/package.json ./services/notification-service/
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared-types/node_modules ./packages/shared-types/node_modules
COPY --from=deps /app/packages/db-schema/node_modules ./packages/db-schema/node_modules
COPY --from=deps /app/services/notification-service/node_modules ./services/notification-service/node_modules
COPY tsconfig.base.json ./
COPY packages/shared-types ./packages/shared-types
COPY packages/db-schema ./packages/db-schema
COPY services/notification-service ./services/notification-service
RUN cd packages/db-schema && npx prisma generate
RUN cd services/notification-service && pnpm build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/packages/db-schema/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/services/notification-service/dist ./dist
COPY --from=builder /app/services/notification-service/node_modules ./node_modules

EXPOSE 3004
CMD ["node", "dist/index.js"]
