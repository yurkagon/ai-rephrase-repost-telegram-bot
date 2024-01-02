import { Context } from "telegraf";
import { toHTML } from "@telegraf/entity";
import _ from "lodash";

import TelegramBot from "./libs/TelegramBot";
import TextRewriter from "./libs/TextRewriter";

class App {
  private readonly targetChannel: string = "@test_yuragon";

  private mediaGroupStore: Record<
    string,
    {
      data: any[];
      publish: () => Promise<void>;
    }
  > = {};

  private bot = new TelegramBot();
  private rewriter = new TextRewriter();

  public async run() {
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

    await ctx.telegram.sendMessage(this.targetChannel, formattedText, {
      parse_mode: "HTML",
    });
  }

  private async onTrackedChannelSinglePhotoPost(ctx: any) {
    const photo = ctx.channelPost.photo as [{ file_id: string }];
    const caption = ctx.channelPost.caption;

    const formattedCaption = await this.rewriter.rewriteTelegramHTML(caption);

    await ctx.telegram.sendPhoto(this.targetChannel, _.last(photo).file_id, {
      caption: formattedCaption,
      parse_mode: "HTML",
    });
  }

  private async onTrackedChannelSingleVideoPost(ctx: any) {
    const video = ctx.channelPost.video;
    const caption = ctx.channelPost.caption || "";

    const formattedCaption = await this.rewriter.rewriteTelegramHTML(caption);

    await ctx.telegram.sendVideo(this.targetChannel, video.file_id, {
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
        publish: _.debounce(async function () {
          try {
            await ctx.telegram.sendMediaGroup(targetChannel, this.data);
          } catch (error) {
            console.error("error", error);
            console.error("Media group data", this.data);
          } finally {
            delete mediaGroupStore[mediaGroupID];
          }
        }, 1000),
      };
    }

    const highestQualityPhoto = _.last(
      ctx.channelPost.photo as [{ file_id: string }]
    );
    const mediaGroupItem = {
      type: "photo",
      media: highestQualityPhoto.file_id,
    };

    const formattedCaption = await this.rewriter.rewriteTelegramHTML(
      ctx.channelPost.caption
    );
    if (formattedCaption) {
      mediaGroupItem["caption"] = formattedCaption;
      mediaGroupItem["parse_mode"] = "HTML";
    }

    this.mediaGroupStore[mediaGroupID].data.push(mediaGroupItem);

    await this.mediaGroupStore[mediaGroupID].publish();
  }
}

const app = new App();

app.run().then(() => console.log("App is running"));
