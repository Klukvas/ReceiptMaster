# syntax=docker/dockerfile:1
# Multi-stage build
FROM node:20-alpine AS builder

WORKDIR /app

# Копируем package.json, yarn.lock и .npmrc
COPY package.json yarn.lock .npmrc ./
# Private package auth is mounted for installation only and never saved in a layer.
RUN --mount=type=secret,id=github_token,required=true \
    GITHUB_TOKEN="$(cat /run/secrets/github_token)" yarn install --frozen-lockfile

# Копируем исходный код
COPY . .

# Принимаем build args
ARG RELEASE_SHA=development
ARG VITE_API_URL
ARG VITE_API_KEY
ARG VITE_BILLING_ENABLED=false
ARG VITE_PADDLE_CLIENT_TOKEN
ARG VITE_PADDLE_ENVIRONMENT=production

# Передаём переменные окружения для Vite во время сборки
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_API_KEY=${VITE_API_KEY}
ENV VITE_BILLING_ENABLED=${VITE_BILLING_ENABLED}
ENV VITE_PADDLE_CLIENT_TOKEN=${VITE_PADDLE_CLIENT_TOKEN}
ENV VITE_PADDLE_ENVIRONMENT=${VITE_PADDLE_ENVIRONMENT}

# Собираем приложение
RUN case "$VITE_BILLING_ENABLED" in \
      false) ;; \
      true) test -n "$VITE_PADDLE_CLIENT_TOKEN" && test "$VITE_PADDLE_ENVIRONMENT" = "production" ;; \
      *) echo "VITE_BILLING_ENABLED must be true or false" >&2; exit 1 ;; \
    esac && ./node_modules/.bin/vite build && \
    printf '{"sha":"%s","billingEnabled":%s}\n' "$RELEASE_SHA" "$VITE_BILLING_ENABLED" > dist/release.json

# Production stage with nginx
FROM nginx:alpine

# Устанавливаем OpenSSL для генерации сертификатов
RUN apk add --no-cache openssl

# Создаем директории для SSL
RUN mkdir -p /etc/ssl/certs /etc/ssl/private

# Генерируем самоподписанный SSL сертификат
RUN openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/ssl/private/nginx-selfsigned.key \
    -out /etc/ssl/certs/nginx-selfsigned.crt \
    -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"

# Копируем собранное приложение
COPY --from=builder /app/dist /usr/share/nginx/html

# Копируем конфигурацию nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
