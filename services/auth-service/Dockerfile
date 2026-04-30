FROM node:20-alpine AS base
RUN npm install -g pnpm@9

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/db-schema/package.json ./packages/db-schema/
COPY services/auth-service/package.json ./services/auth-service/
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/shared-types/node_modules ./packages/shared-types/node_modules
COPY --from=deps /app/packages/db-schema/node_modules ./packages/db-schema/node_modules
COPY --from=deps /app/services/auth-service/node_modules ./services/auth-service/node_modules
COPY tsconfig.base.json ./
COPY packages/shared-types ./packages/shared-types
COPY packages/db-schema ./packages/db-schema
COPY services/auth-service ./services/auth-service
RUN cd packages/db-schema && npx prisma generate
RUN cd services/auth-service && pnpm build

FROM node:20-alpine AS runner
WORKDIR /app
RUN npm install -g pnpm@9
COPY --from=builder /app/packages/db-schema/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/services/auth-service/dist ./dist
COPY --from=builder /app/services/auth-service/node_modules ./node_modules
COPY --from=builder /app/packages/shared-types/dist ./packages/shared-types/dist

EXPOSE 3001
CMD ["node", "dist/index.js"]
