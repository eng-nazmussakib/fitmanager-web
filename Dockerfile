# syntax=docker/dockerfile:1
#
#   deps ──┬── test     format, lint, unit tests (CI builds this target first)
#          └── build ── prod    Node SSR server (target B: VM with Docker and nginx, D-027)
#
#   docker build --target test .
#   docker build --build-arg BUILD_ENV=production-vm -t fitmanager-web .     (production-vm | demo)
#   docker run -p 4000:4000 -e NG_ALLOWED_HOSTS=localhost fitmanager-web    then: curl localhost:4000/healthz
#
# The primary target, Cloudflare Workers, does not use this image: it deploys `npm run build:prod` (dist/browser)
# with the Cloudflare CLI (../fitmanager-infra/cloudflare/web.md).

# Keep in sync with .nvmrc and package.json "engines".
FROM node:26-alpine AS deps
WORKDIR /app
ENV CI=true
# Manifests first, so `npm ci` is cached until dependencies change. --ignore-scripts: skips husky (no .git here).
COPY package.json package-lock.json .npmrc ./
RUN npm ci --ignore-scripts

FROM deps AS test
COPY . .
RUN npm run format:check && npm run lint && npx ng test --watch=false

FROM deps AS build
# No default on purpose: a forgotten --build-arg must fail, not silently build something else.
ARG BUILD_ENV
RUN test -n "${BUILD_ENV}" || { echo "BUILD_ENV is required: production-vm | demo" >&2; exit 1; }
COPY . .
RUN npx ng build --configuration "${BUILD_ENV}" && node scripts/postbuild.mjs

# Runtime: only the build output (the server bundle has its dependencies inlined), as a non-root user.
FROM node:26-alpine AS prod
ENV NODE_ENV=production PORT=4000 NG_ALLOWED_HOSTS=localhost,127.0.0.1
WORKDIR /app
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 CMD wget -qO- http://127.0.0.1:4000/healthz >/dev/null || exit 1
CMD ["node", "dist/server/server.mjs"]
