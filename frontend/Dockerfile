# Multi-stage build
FROM --platform=linux/amd64 node:20-alpine AS builder

WORKDIR /app

# Устанавливаем vite глобально
RUN npm install -g vite

# Копируем package.json и yarn.lock
COPY package.json yarn.lock ./

# Устанавливаем зависимости через npm
RUN npm install

# Копируем исходный код
COPY . .

# Передаём переменные окружения для Vite во время сборки
ARG VITE_API_URL
ARG VITE_API_KEY
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_API_KEY=${VITE_API_KEY}

# Собираем приложение
RUN vite build

# Production stage with nginx
FROM --platform=linux/amd64 nginx:alpine

# Копируем собранное приложение
COPY --from=builder /app/dist /usr/share/nginx/html

# Копируем конфигурацию nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
