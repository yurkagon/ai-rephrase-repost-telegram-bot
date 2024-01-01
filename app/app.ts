import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { toHTML } from "@telegraf/entity";

const targetChannel = "@test_yuragon";

const bot = new Telegraf(process.env.TELEGRAM_BOT_API_TOKEN as string);
bot.start((ctx) => ctx.reply("Welcome"));

bot.on(message("text"), (ctx) => {
  console.log(ctx.message);
});

bot.on("channel_post", async (ctx: any) => {
  if (ctx.channelPost.photo) {
    const photo = ctx.channelPost.photo;
    const caption = ctx.channelPost.caption;

    const formattedCaption = caption + "\n<b>Author Yurii</b>";


    await ctx.telegram.sendPhoto(
      targetChannel,
      photo[photo.length - 1].file_id,
      {
        caption: formattedCaption,
        parse_mode: "HTML",
      }
    );
  } else if (ctx.channelPost.text) {
    const formattedText = toHTML(ctx.channelPost) + "\n<b>Author Yurii</b>";
    await ctx.telegram.sendMessage(targetChannel, formattedText, {
      parse_mode: "HTML",
    });
  }
});

bot.launch().then(() => console.info("Bot connected"));
