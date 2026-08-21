FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json tsconfig.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/i18n/package.json packages/i18n/package.json
COPY packages/solver/package.json packages/solver/package.json
COPY packages/tutu/package.json packages/tutu/package.json
RUN npm ci

COPY apps/api apps/api
COPY packages packages
COPY tools tools
RUN npx tsc -b packages/contracts packages/i18n packages/domain packages/solver packages/tutu apps/api \
  && npm prune --omit=dev

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/packages packages
COPY --from=build /app/tools tools
USER node
EXPOSE 3000
CMD ["npm", "run", "start", "-w", "@rendezvous/api"]
