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
      onUserStartBot: (ctx) => ctx.reply("Welcome"),
      onBotChatMessage: (ctx) => console.log(ctx.message),
      onTrackedChannelPost: async (ctx: any) => {
        if (ctx.channelPost.media_group_id) {
          const mediaGroupID = ctx.channelPost.media_group_id;
          if (!this.mediaGroupStore[mediaGroupID]) {
            const mediaGroupStore = this.mediaGroupStore;
            const targetChannel = this.targetChannel;

            mediaGroupStore[mediaGroupID] = {
              data: [],
              publish: _.debounce(async function () {
                try {
                  await ctx.telegram.sendMediaGroup(
                    targetChannel,
                    this.data
                  );
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
        } else if (ctx.channelPost.photo) {
          const photo = ctx.channelPost.photo as [{ file_id: string }];
          const caption = ctx.channelPost.caption;

          const formattedCaption = await this.rewriter.rewriteTelegramHTML(caption);

          await ctx.telegram.sendPhoto(
            this.targetChannel,
            _.last(photo).file_id,
            {
              caption: formattedCaption,
              parse_mode: "HTML",
            }
          );
        } else if (ctx.channelPost.text) {
          const formattedText = await this.rewriter.rewriteTelegramHTML(
            toHTML(ctx.channelPost)
          );
          await ctx.telegram.sendMessage(this.targetChannel, formattedText, {
            parse_mode: "HTML",
          });
        }
      },
    });
  }
}

const app = new App();

app.run().then(() => console.log("App is running"));
