import { Context } from "telegraf";
import { toHTML } from "@telegraf/entity";
import _ from "lodash";

import TelegramBot from "./libs/TelegramBot";
import TextRewriter from "./libs/TextRewriter";
import LanguageModelService from "./services/LanguageModelService";

class App {
  private readonly targetChannel: string = "@test_yuragon";

  private mediaGroupStore: Record<
    string,
    {
      data: any[];
      publish: () => Promise<void>;
      isUploadingFinished: boolean;
    }
  > = {};

  private bot = new TelegramBot();
  private rewriter = new TextRewriter();

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

  private onBotChatMessage(ctx: Context) {
    ctx.reply("Message received");
  }

  private async onTrackedChannelPost(ctx: any) {
    if (ctx.channelPost.media_group_id) {
      this.onTrackedChannelMediaGroupPost(ctx);
    } else if (ctx.channelPost.photo) {
      this.onTrackedChannelSinglePhotoPost(ctx);
    } else if (ctx.channelPost.video) {
      this.onTrackedChannelSingleVideoPost(ctx);
    } else if (ctx.channelPost.text) {
      this.onTrackedChannelTextPost(ctx);
    }
  }

  private async onTrackedChannelTextPost(ctx: any) {
    const formattedText = await this.rewriter.rewriteTelegramHTML(
      toHTML(ctx.channelPost)
    );

    await this.bot.telegram.sendMessage(this.targetChannel, formattedText, {
      parse_mode: "HTML",
    });
  }

  private async onTrackedChannelSinglePhotoPost(ctx: any) {
    const photo = ctx.channelPost.photo as [{ file_id: string }];

    const formattedCaption = await this.rewriter.rewriteTelegramHTML(
      toHTML({
        caption: ctx.channelPost.caption,
        caption_entities: ctx.channelPost.caption_entities,
      })
    );

    await this.bot.telegram.sendPhoto(this.targetChannel, _.last(photo).file_id, {
      caption: formattedCaption,
      parse_mode: "HTML",
    });
  }

  private async onTrackedChannelSingleVideoPost(ctx: any) {
    const video = ctx.channelPost.video;

    const formattedCaption = await this.rewriter.rewriteTelegramHTML(
      toHTML({
        caption: ctx.channelPost.caption,
        caption_entities: ctx.channelPost.caption_entities,
      })
    );

    await this.bot.telegram.sendVideo(this.targetChannel, video.file_id, {
      caption: formattedCaption,
      parse_mode: "HTML",
    });
  }

  private async onTrackedChannelMediaGroupPost(ctx: any) {
    const mediaGroupID = ctx.channelPost.media_group_id;
    if (!this.mediaGroupStore[mediaGroupID]) {
      const mediaGroupStore = this.mediaGroupStore;
      const targetChannel = this.targetChannel;

      mediaGroupStore[mediaGroupID] = {
        data: [],
        isUploadingFinished: false,
        publish: _.debounce(async () => {
          try {
            const data = await Promise.all(
              mediaGroupStore[mediaGroupID].data.map(async (item) => {
                const formattedCaption =
                  await this.rewriter.rewriteTelegramHTML(item.caption);

                return {
                  ...item,
                  caption: formattedCaption,
                };
              })
            );

            await this.bot.telegram.sendMediaGroup(targetChannel, data);
          } catch {
          } finally {
            mediaGroupStore[mediaGroupID].isUploadingFinished = true;
          }
        }, 1000),
      };
    }

    if (this.mediaGroupStore[mediaGroupID].isUploadingFinished) return;

    this.mediaGroupStore[mediaGroupID].data.push({
      type: "photo",
      media: _.last(ctx.channelPost.photo as [{ file_id: string }]).file_id,
      caption: toHTML({
        caption: ctx.channelPost.caption,
        caption_entities: ctx.channelPost.caption_entities,
      }),
      parse_mode: "HTML",
    });

    await this.mediaGroupStore[mediaGroupID].publish();
  }
}

const app = new App();

app.run().then(() => console.log("App is running"));
