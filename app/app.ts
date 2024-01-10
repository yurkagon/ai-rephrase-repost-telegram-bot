import { Context } from "telegraf";

import _ from "lodash";

import TelegramBot, { Message } from "./libs/TelegramBot";
import LanguageModelService from "./services/LanguageModelService";
import DatabaseService from "./services/DatabaseService";

import TextRewriter from "./libs/TextRewriter";

class App {
  private readonly targetChannel: string = "@test_yuragon";
  private bot = new TelegramBot();
  private rewriter = new TextRewriter();

  public async run() {
    await DatabaseService.connectDb().then(() => console.log("DB connected"));
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

  private async onTrackedChannelPost(ctx: Context) {
    return this.bot.copyMessage({
      message: ctx.channelPost as any,
      chatId: this.targetChannel,
      updateText: async ({ html }) => {
        const updatedHtml = await this.rewriter.rewriteTelegramHTML(html);

        return updatedHtml;
      }
    });
  }

  private async onBotChatMessage(ctx: Context) {
    // ctx.reply("Making a copy...");
    // await this.bot.copyMessage(ctx.message as any, this.targetChannel);
    // ctx.reply("Done");
  }
}

const app = new App();

app.run().then(() => console.log("App is running"));
