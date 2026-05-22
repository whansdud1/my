FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache wget tini && addgroup -S app && adduser -S -G app app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json vite.config.ts index.html ./
USER app
EXPOSE 9518
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["npx", "vite", "preview", "--host", "0.0.0.0", "--port", "9518", "--strictPort"]
