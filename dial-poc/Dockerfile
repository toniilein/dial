# DIAL Phase 0 PoC — single Node service (API + static UI), SQLite, re-seeds on boot.
FROM node:22-slim

# Build tools for better-sqlite3's native addon (falls back from prebuilt if needed).
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install deps first for better layer caching.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# App source.
COPY . .

# Hosts inject PORT; default to 3000. Bind is 0.0.0.0 by default (app.listen(PORT)).
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
