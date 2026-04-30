FROM node:20-alpine
RUN npm install -g pnpm@9
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/db-schema/package.json ./packages/db-schema/
RUN pnpm install --frozen-lockfile
COPY packages/db-schema ./packages/db-schema
WORKDIR /app/packages/db-schema
CMD ["npx", "prisma", "migrate", "deploy"]
