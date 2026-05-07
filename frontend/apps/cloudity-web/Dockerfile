# Build depuis la racine monorepo : docker build -f apps/cloudity-web/Dockerfile .
# (contexte = répertoire frontend/)
FROM node:20-alpine AS builder

RUN npm install -g npm@11.13.0 && npm --version

WORKDIR /ws

COPY package.json package-lock.json* ./
COPY packages ./packages
COPY apps/cloudity-web ./apps/cloudity-web

RUN npm ci

WORKDIR /ws/apps/cloudity-web
RUN npm run build

FROM nginx:alpine

RUN apk add --no-cache curl

COPY --from=builder /ws/apps/cloudity-web/dist /usr/share/nginx/html

COPY apps/cloudity-web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
