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
```

### CORS

- Если `ALLOWED_ORIGINS` пустой, браузерные cross-origin запросы блокируются.
- Для быстрой отладки можно использовать `ALLOWED_ORIGINS=*`.
- В проде указывай точные origin через запятую (например, `https://drive.corp.amazon.com`).

## Важно про OAuth authorize endpoint

`/authorize` у провайдеров OAuth/OIDC обычно не предназначен для XHR/fetch из браузера и часто не отдаёт CORS-заголовки.

Используй redirect (например, `window.location = authorizeUrl`) или backend-proxy для сервер-серверного обмена, а не XHR к `.../authorize`.