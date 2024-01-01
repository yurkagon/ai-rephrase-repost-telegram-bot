import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";

const bot = new Telegraf(process.env.TELEGRAM_BOT_API_TOKEN as string);
bot.start((ctx) => ctx.reply("Welcome"));

bot.on(message("sticker"), (ctx) => ctx.reply("👍"));
bot.hears("hi", (ctx) => ctx.reply("Hey there"));

bot.on(message("text"), (ctx) => {
  console.log(ctx.message.text)

  ctx.reply(`Message received: ${ctx.message.text}`);
});

bot.launch().then(() => console.info("Bot connected"));
