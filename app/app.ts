import { Context } from "telegraf";

import _ from "lodash";

import TelegramBot, { Message } from "./libs/TelegramBot";
import TextRewriter from "./libs/TextRewriter";
import LanguageModelService from "./services/LanguageModelService";

class App {
  private readonly targetChannel: string = "@test_yuragon";
  private bot = new TelegramBot();
  // private rewriter = new TextRewriter();

  public async run() {
    await LanguageModelService.init();

    this.bot.init({
      targetChannel: this.targetChannel,
      onUserStartBot: this.onUserStartBot.bind(this),
      onBotChatMessage: this.onBotChatMessage.bind(this),
      onTrackedChannelPost: this.onTrackedChannelPost.bind(this),
    });
  }

  private onUserStartBot(ctx: Context) {
    ctx.reply("Welcome");
  }

  private async onBotChatMessage(ctx: Context) {
    ctx.reply("Making a copy...");

    await this.bot.copyMessage(ctx.message as any, this.targetChannel);

    ctx.reply("Done");
  }

  private async onTrackedChannelPost(ctx: Context) {
    return this.bot.copyMessage(ctx.channelPost as any, this.targetChannel);
  }
}

const app = new App();

app.run().then(() => console.log("App is running"));
