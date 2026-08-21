FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json tsconfig.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/i18n/package.json packages/i18n/package.json
COPY packages/solver/package.json packages/solver/package.json
COPY packages/tutu/package.json packages/tutu/package.json
RUN npm ci

COPY apps/web apps/web
COPY packages packages
ARG VITE_BUILD_SHA=development
ARG VITE_BUILD_TIME=
ENV VITE_API_MODE=http
ENV VITE_API_BASE_URL=
ENV VITE_BUILD_SHA=$VITE_BUILD_SHA
ENV VITE_BUILD_TIME=$VITE_BUILD_TIME
RUN npx tsc -b packages/contracts packages/i18n packages/domain packages/solver apps/web \
  && npm run build:web

FROM nginx:1.29-alpine AS runtime
ENV API_UPSTREAM=http://api:3000
COPY infra/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
