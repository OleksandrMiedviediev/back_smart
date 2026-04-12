# back_smart

## Запуск

1. Установить зависимости:

```bash
npm install
```

2. Создать `.env` рядом с `server.js` (пример ниже).

3. Запустить сервер:

```bash
npm start
```

## Пример `.env`

```env
PORT=3000
API_KEY=
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
CORS_DEFAULT_ALLOW_ALL=true
DEBUG_CORS=false
```

### CORS

- Если `ALLOWED_ORIGINS` пустой, браузерные cross-origin запросы блокируются.
- Если `ALLOWED_ORIGINS` пустой и `CORS_DEFAULT_ALLOW_ALL=true`, сервер временно разрешает любой origin (fallback).
- Для быстрой отладки можно использовать `ALLOWED_ORIGINS=*`.
- В проде указывай origin через запятую (например, `https://drive.corp.amazon.com`).
- Поддерживаются wildcard-шаблоны, например `https://*.corp.amazon.com`.
- Для диагностики preflight включи `DEBUG_CORS=true` и посмотри логи сервера.

## Важно про OAuth authorize endpoint

`/authorize` у провайдеров OAuth/OIDC обычно не предназначен для XHR/fetch из браузера и часто не отдаёт CORS-заголовки.

Используй redirect (например, `window.location = authorizeUrl`) или backend-proxy для сервер-серверного обмена, а не XHR к `.../authorize`.