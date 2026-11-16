# SnapCampus API — production image
FROM node:20-bookworm-slim AS base
WORKDIR /app
# Prisma + sharp need OpenSSL/libc bits present in slim
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# --- deps ---
FROM base AS deps
COPY package.json package-lock.json* ./
COPY apps/api/package.json ./apps/api/package.json
RUN npm install --workspace @snapcampus/api --include-workspace-root=false || npm install

# --- build ---
FROM deps AS build
COPY apps/api ./apps/api
WORKDIR /app/apps/api
RUN npx prisma generate && npx tsc -p tsconfig.json

# --- run ---
FROM base AS run
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
WORKDIR /app/apps/api
EXPOSE 4000
# Apply migrations, then start. (Use object storage in prod so uploads persist.)
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
