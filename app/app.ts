import type { Context } from "telegraf";
import type { Update } from "telegraf/types";
import TelegramBot from "./libs/TelegramBot";
import TextRewriter from "./ai/TextRewriter";

export default class App {
  constructor(
    private readonly bot: TelegramBot,
    private readonly rewriter: TextRewriter,
    private readonly targetChannel: string,
  ) {}

  public run(): Promise<void> {
    return this.bot.init({
      targetChannel: this.targetChannel,
      onUserStartBot: (ctx) => ctx.reply("Welcome"),
      onTrackedChannelPost: (ctx) => this.onTrackedChannelPost(ctx),
    });
  }

  private onTrackedChannelPost(ctx: Context<Update.ChannelPostUpdate>): Promise<void> {
    return this.bot.copyMessage({
      message: ctx.channelPost,
      chatId: this.targetChannel,
      updateText: ({ html }) => this.rewriter.rewriteTelegramHTML(html),
    });
  }
}
