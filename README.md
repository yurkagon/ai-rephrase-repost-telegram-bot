# Telegram repost bot

Бот перекладає дописи українською через LangChain та публікує їх у Telegram.

## Запуск

Потрібен Node.js 22 або новіший.

```sh
npm ci
cp .env.sample .env
npm start
```

Перед запуском заповни `.env`: `TELEGRAM_BOT_API_TOKEN` та
`OPEN_API_SECRET_KEY` (також підтримується `OPENAI_API_KEY`, він має пріоритет).
`LLM_MODEL` задає назву моделі. За замовчуванням збережено попередню
`gpt-3.5-turbo`. Канал призначення налаштовується в `app/app.ts`.

## Заміна провайдера

`app/services/createLanguageModel.ts` створює поточну модель `ChatOpenAI`.
Щоб підключити іншого провайдера, встанови його адаптер LangChain і зміни
цю фабрику так, щоб вона повертала відповідну реалізацію `BaseChatModel`.

`LanguageModelService.init(model)` приймає будь-яку реалізацію `BaseChatModel`.
Сервіс передає системний промпт та повідомлення через `invoke()` і перетворює
відповідь на текст через `StringOutputParser`. Логіка Telegram та `TextRewriter`
не залежить від конкретного провайдера. Модель повинна підтримувати текстові
відповіді та системні інструкції, потрібні для перекладу.

## Перевірки

```sh
npm test
npx tsc --noEmit
```

Тести використовують локальні моделі-заглушки без запитів до API.
