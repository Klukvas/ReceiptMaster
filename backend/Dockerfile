FROM node:20-alpine

WORKDIR /app

# Устанавливаем зависимости для Puppeteer
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Устанавливаем переменную окружения для Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Копируем package.json
COPY backend/package.json ./

# Устанавливаем зависимости
RUN yarn install

# Устанавливаем Nest CLI глобально
RUN yarn global add @nestjs/cli

# Копируем исходный код
COPY backend/ .

# Создаем директорию для чеков
RUN mkdir -p /app/receipts

# Проверяем, что файлы скопированы правильно
RUN ls -la src/modules/receipts/
RUN cat src/modules/receipts/receipts.module.ts

# Проверяем, что TypeScript может найти файлы
RUN npx tsc --noEmit --listFiles | grep receipts

# Собираем приложение
RUN yarn build

EXPOSE 3000

CMD ["yarn", "start:prod"]
