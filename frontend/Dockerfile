FROM node:26-alpine AS base

ENV NEXT_TELEMETRY_DISABLED=1

WORKDIR /app

# The exact Alpine package revision follows the pinned base-image repository.
# hadolint ignore=DL3018
RUN apk add --no-cache libc6-compat

FROM base AS dependencies

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM dependencies AS development

ENV NODE_ENV=development

COPY . .

EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0", "--port", "3000"]

FROM dependencies AS builder

ARG NEXT_PUBLIC_APP_URL=http://localhost:8080
ARG NEXT_PUBLIC_API_BASE_URL=/api/v1
ARG NEXT_PUBLIC_CSRF_COOKIE_NAME=neb_csrf
ARG API_BASE_URL=http://backend:8000/api/v1

ENV NODE_ENV=production \
    NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL} \
    NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL} \
    NEXT_PUBLIC_CSRF_COOKIE_NAME=${NEXT_PUBLIC_CSRF_COOKIE_NAME} \
    API_BASE_URL=${API_BASE_URL}

COPY . .
RUN mkdir -p public \
    && npm run build

FROM dependencies AS production-dependencies

RUN npm prune --omit=dev --no-audit

FROM base AS production

ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    API_BASE_URL=http://backend:8000/api/v1

RUN addgroup --system --gid 10001 nodejs \
    && adduser --system --uid 10001 --ingroup nodejs nextjs

COPY --from=production-dependencies --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/next.config.ts ./next.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

USER nextjs

EXPOSE 3000
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
