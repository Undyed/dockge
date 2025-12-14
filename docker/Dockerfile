############################################
# Healthcheck Binary
############################################
FROM golang:1.21.4-bookworm AS build_healthcheck
WORKDIR /app
COPY ./extra/healthcheck.go ./extra/healthcheck.go
RUN go build -x -o ./extra/healthcheck ./extra/healthcheck.go

############################################
# Frontend Build
############################################
FROM node:22-bookworm AS build_frontend
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:frontend

############################################
# Backend Dependencies
############################################
FROM node:22-bookworm-slim AS build_backend
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

############################################
# ⭐ Main Image
############################################
FROM node:22-bookworm-slim AS release
WORKDIR /app

# Install dependencies (from Base.Dockerfile)
RUN apt-get update && apt-get install --yes --no-install-recommends \
    curl \
    ca-certificates \
    gnupg \
    unzip \
    dumb-init \
    && install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && chmod a+r /etc/apt/keyrings/docker.gpg \
    && echo \
         "deb [arch="$(dpkg --print-architecture)" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/debian \
         "$(. /etc/os-release && echo "$VERSION_CODENAME")" stable" | \
         tee /etc/apt/sources.list.d/docker.list > /dev/null \
    && apt-get update \
    && apt-get --yes --no-install-recommends install \
         docker-ce-cli \
         docker-compose-plugin \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g tsx@~4.19.3

# Copy built artifacts
COPY --chown=node:node --from=build_healthcheck /app/extra/healthcheck /app/extra/healthcheck
COPY --from=build_backend /app/node_modules /app/node_modules
COPY --from=build_frontend /app/frontend-dist /app/frontend-dist
COPY --chown=node:node . .

# Remove unnecessary files for production
RUN rm -rf frontend node_modules/.cache && mkdir ./data

# It is just for safe, as by default, it is disabled in the latest Node.js now.
# Read more:
# - https://github.com/sagemathinc/cocalc/issues/6963
# - https://github.com/microsoft/node-pty/issues/630#issuecomment-1987212447
ENV UV_USE_IO_URING=0

VOLUME /app/data
EXPOSE 5001
HEALTHCHECK --interval=60s --timeout=30s --start-period=60s --retries=5 CMD extra/healthcheck
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["tsx", "./backend/index.ts"]

############################################
# Mark as Nightly
############################################
FROM release AS nightly
RUN npm run mark-as-nightly
