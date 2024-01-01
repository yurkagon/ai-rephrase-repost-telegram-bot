import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";

const bot = new Telegraf(process.env.TELEGRAM_BOT_API_TOKEN as string);
bot.start((ctx) => ctx.reply("Welcome"));
bot.hears("hi", (ctx) => ctx.reply("Hey there"));
bot.on(message("sticker"), (ctx) => ctx.reply("👍"));


bot.on(message("text"), (ctx) => {
  ctx.telegram.sendMessage("@test_yuragon", ctx.message.text)
});

bot.launch().then(() => console.info("Bot connected"));
