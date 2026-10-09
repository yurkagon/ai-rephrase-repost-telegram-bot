# Telegram repost bot

Бот перекладає дописи українською через LangChain та публікує їх у Telegram.

## Запуск

Потрібен Node.js 24. Версію задано в `.nvmrc`, `.node-version` та `package.json`.

```sh
nvm use
npm ci
cp .env.sample .env
npm start
```

Перед запуском заповни `.env`: `TELEGRAM_BOT_API_TOKEN` та
`OPEN_API_SECRET_KEY` (також підтримується `OPENAI_API_KEY`, він має пріоритет).
`LLM_MODEL` задає назву моделі. За замовчуванням збережено попередню
`gpt-3.5-turbo`. Канал призначення налаштовується в `app/app.ts`.

## Заміна провайдера

`LanguageModelService.init()` створює поточну модель `ChatOpenAI` у сервісі.
Щоб підключити іншого провайдера, встанови його адаптер LangChain і зміни
метод `createLanguageModel()` у `app/services/LanguageModelService.ts`
так, щоб він повертав відповідну реалізацію `BaseChatModel`.

`LanguageModelService.init(model)` приймає будь-яку реалізацію `BaseChatModel`.
Сервіс передає системний промпт та повідомлення через `invoke()` і перетворює
відповідь на текст через `StringOutputParser`. Логіка Telegram та `TextRewriter`
не залежить від конкретного провайдера. Модель повинна підтримувати текстові
відповіді та системні інструкції, потрібні для перекладу.

## Перевірки

```sh
npm test
npm run typecheck
```

Тести використовують локальні моделі-заглушки без запитів до API.
