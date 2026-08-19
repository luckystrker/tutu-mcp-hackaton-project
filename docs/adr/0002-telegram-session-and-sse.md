# ADR 0002: Telegram session, CORS и SSE

- Статус: принят
- Дата: 2026-08-19

## Решение

Backend проверяет raw Telegram `initData` и выдаёт случайную 256-битную
application session. В БД хранится только SHA-256 токена. Bearer-токен живёт
только в памяти frontend и после reload перевыпускается из `initData`.
Production принимает identity исключительно из bearer-session; `x-user-id`
остаётся только у явно подключённого test authenticator.

Сессия действует 30 минут. `initData` принимается не старше 10 минут и не более
чем на 30 секунд из будущего. Повторная проверка допустима в этом окне, но
перевыпуск отзывает предыдущие активные сессии пользователя. Это обеспечивает
восстановление после потерянного HTTP-ответа без долгого replay window.

Web и API обслуживаются с одного origin через reverse proxy. Для раздельного
development origin backend разрешает только `PUBLIC_MINI_APP_URL`, bearer и
`Content-Type`; wildcard CORS запрещён.

SSE использует authenticated fetch, передаёт bearer и курсор `after`. После
reconnect клиент всегда инвалидирует REST snapshot. События валидируются общей
discriminated Zod-схемой; gap или истёкший retention требует полного resync.

## Последствия

Bearer нельзя сохранять в local/session storage или логировать. При reload
нужен новый `/api/auth/telegram`. Компрометация свежего `initData` остаётся
эквивалентна компрометации Telegram launch context до истечения десяти минут.

## Эксплуатация

Статический хостинг Mini App обязан отдавать заголовок
`Content-Security-Policy: frame-ancestors https://web.telegram.org https://*.telegram.org`:
`frame-ancestors` игнорируется в `<meta>`-теге, поэтому встроенная в
`index.html` CSP (script/style/connect-src, ставится при сборке через Vite)
покрывает только ресурсы документа. API ставит этот заголовок только на свои
ответы и фреймится Telegram-ом напрямую.

За reverse proxy API запускается с `TRUST_PROXY` (`true`, число hop-ов или
список CIDR), иначе `request.ip` адресует прокси и все пользователи делят общие
бакеты rate limit (10 auth/мин, 30 join/мин, 120 мутаций/мин).
