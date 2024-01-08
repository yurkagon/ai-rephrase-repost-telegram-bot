import { Telegraf, Context } from "telegraf";
import { message } from "telegraf/filters";
import _ from "lodash";

class TelegramBot {
  public instance = new Telegraf(process.env.TELEGRAM_BOT_API_TOKEN as string);

  private targetChannel: string;

  public init({
    targetChannel,
    onUserStartBot,
    onBotChatMessage,
    onTrackedChannelPost,
  }: {
    targetChannel: string;
    onUserStartBot: (ctx: Context) => any;
    onBotChatMessage: (ctx: Context) => any;
    onTrackedChannelPost: (ctx: Context) => any;
  }) {
    this.targetChannel = targetChannel;
    this.instance.start(onUserStartBot);
    this.instance.on(message("text"), onBotChatMessage);

    this.instance.on("channel_post", async (ctx) => {
      if (`@${ctx.channelPost.chat.username}` === this.targetChannel) return;

      return onTrackedChannelPost(ctx);
    });

    return this.instance.launch();
  }

  public get telegram() {
    return this.instance.telegram;
  }
}

export default TelegramBot;
