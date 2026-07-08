# SignX Reach API/worker — multi-arch (works on Oracle Ampere ARM).
# The same image runs both processes; compose overrides the command
# for the worker (`node dist/worker`).

FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npx prisma generate && npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl postgresql16-client
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY scripts ./scripts

EXPOSE 3001
CMD ["node", "dist/main"]
