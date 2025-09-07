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

# Копируем package.json (контекст билда: ./backend)
COPY package.json ./

# Устанавливаем зависимости
RUN yarn install

# Устанавливаем Nest CLI глобально
RUN yarn global add @nestjs/cli

# Копируем исходный код (контекст билда: ./backend)
COPY . .

# Создаем директорию для чеков
RUN mkdir -p /app/receipts

# Диагностика: проверяем наличие файлов модулей/энтити и видимость для TS
RUN echo "Listing key files under src/modules:" && \
    find src/modules -maxdepth 3 -type f -name "*.ts" | sort | sed 's/^/ - /'
RUN test -f src/modules/receipts/receipts.module.ts && echo "OK: receipts.module.ts exists" || (echo "MISSING: src/modules/receipts/receipts.module.ts" && ls -la src/modules/receipts/ || true)
RUN test -f src/modules/receipts/entities/receipt.entity.ts && echo "OK: receipt.entity.ts exists" || (echo "MISSING: src/modules/receipts/entities/receipt.entity.ts" && ls -la src/modules/receipts/entities/ || true)
RUN npx tsc -p tsconfig.build.json --noEmit --listFiles | grep -E "receipts.module|receipt.entity" || echo "TypeScript did not list receipts files"

# Собираем приложение
RUN yarn build

EXPOSE 3000

CMD ["yarn", "start:prod"]
