import "dotenv/config";
import App from "./app";
import { readConfig } from "./config";
import { createLanguageModel } from "./ai/model";
import TextRewriter from "./ai/TextRewriter";
import TelegramBot from "./libs/TelegramBot";

async function main(): Promise<void> {
  const config = readConfig();
  const model = createLanguageModel(config);
  const rewriter = new TextRewriter(model);
  const bot = new TelegramBot(config.telegramToken);
  const app = new App(bot, rewriter, config.targetChannel);

  await app.run();
}

main().catch(() => {
  console.error("Bot stopped: check configuration, credentials and network access.");
  process.exitCode = 1;
});
