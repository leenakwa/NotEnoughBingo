FROM node:22-alpine AS base

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

ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_API_BASE_URL=/api/v1
ARG NEXT_PUBLIC_CSRF_COOKIE_NAME=neb_csrf
ARG NEXT_PUBLIC_SUPPORT_EMAIL=
ARG API_BASE_URL=http://backend:8000/api/v1

ENV NODE_ENV=production \
    NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL} \
    NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL} \
    NEXT_PUBLIC_CSRF_COOKIE_NAME=${NEXT_PUBLIC_CSRF_COOKIE_NAME} \
    NEXT_PUBLIC_SUPPORT_EMAIL=${NEXT_PUBLIC_SUPPORT_EMAIL} \
    API_BASE_URL=${API_BASE_URL}

COPY . .
RUN node scripts/validate-production-env.mjs \
    && mkdir -p public \
    && printf '%s\n' "$NEXT_PUBLIC_APP_URL" > .built-origin \
    && npm run build

FROM dependencies AS production-dependencies

RUN npm prune --omit=dev --no-audit

FROM base AS production

ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_SUPPORT_EMAIL
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL} \
    NEXT_PUBLIC_SUPPORT_EMAIL=${NEXT_PUBLIC_SUPPORT_EMAIL} \
    API_BASE_URL=http://backend:8000/api/v1

# Preview images remain non-indexable until the deployment explicitly selects production.
ENV APP_ENVIRONMENT=staging

RUN addgroup --system --gid 10001 nodejs \
    && adduser --system --uid 10001 --ingroup nodejs nextjs

# The production command invokes Node directly; package-manager tooling is not
# needed at runtime and would otherwise retain its own dependency tree.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

COPY --from=production-dependencies --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/.built-origin ./.built-origin
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/scripts/validate-production-env.mjs ./scripts/validate-production-env.mjs
COPY --from=builder --chown=nextjs:nodejs /app/next.config.ts ./next.config.ts
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

USER nextjs

EXPOSE 3000
CMD ["sh", "-c", "node scripts/validate-production-env.mjs && exec node node_modules/next/dist/bin/next start --hostname 0.0.0.0 --port 3000"]
