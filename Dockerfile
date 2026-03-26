# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY index.ts ./
COPY config/ ./config/
COPY middlewares/ ./middlewares/
COPY shared/ ./shared/
COPY src/ ./src/
COPY utils/ ./utils/

RUN npm run build

# ── Stage 2: production ────────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

CMD ["node", "dist/index.js"]

# ── Stage 3: test ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS test

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY index.ts ./
COPY config/ ./config/
COPY middlewares/ ./middlewares/
COPY shared/ ./shared/
COPY src/ ./src/
COPY utils/ ./utils/
COPY tests/ ./tests/

CMD ["npm", "test"]