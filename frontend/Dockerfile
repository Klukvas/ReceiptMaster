# Multi-stage build
FROM node:20-alpine AS builder

WORKDIR /app

# Устанавливаем vite глобально
RUN npm install -g vite

# Копируем package.json и yarn.lock
COPY package.json yarn.lock ./

# Устанавливаем зависимости через npm
RUN npm install

# Копируем исходный код
COPY . .

# Принимаем build args
ARG VITE_API_URL
ARG VITE_API_KEY

# Передаём переменные окружения для Vite во время сборки
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_API_KEY=${VITE_API_KEY}

# Собираем приложение
RUN vite build

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
