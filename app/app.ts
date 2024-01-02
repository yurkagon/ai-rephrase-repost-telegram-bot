import { Telegraf } from "telegraf";
import { message } from "telegraf/filters";
import { toHTML } from "@telegraf/entity";
import _ from "lodash";

const targetChannel = "@test_yuragon";

const bot = new Telegraf(process.env.TELEGRAM_BOT_API_TOKEN as string);
bot.start((ctx) => ctx.reply("Welcome"));

bot.on(message("text"), (ctx) => {
  console.log(ctx.message);
});

const mediaGroupStore: Record<
  string,
  {
    data: any[];
    publish: () => Promise<void>;
  }
> = {};
bot.on("channel_post", async (ctx: any) => {
  if (`@${ctx.channelPost.chat.username}` === targetChannel) return;

  if (ctx.channelPost.media_group_id) {
    const mediaGroupID = ctx.channelPost.media_group_id;
    if (!mediaGroupStore[mediaGroupID]) {
      mediaGroupStore[mediaGroupID] = {
        data: [],
        publish: _.debounce(async function () {
          try {
            console.log("FIRED", this.data);
            await ctx.telegram.sendMediaGroup(targetChannel, this.data);
          } catch (error) {
            console.error("error", error);
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

    const formattedCaption = formatHtmlText(ctx.channelPost.caption);
    if (formattedCaption) {
      mediaGroupItem["caption"] = formattedCaption;
      mediaGroupItem["parse_mode"] = "HTML";
    }

    mediaGroupStore[mediaGroupID].data.push(mediaGroupItem);

    await mediaGroupStore[mediaGroupID].publish();
  } else if (ctx.channelPost.photo) {
    const photo = ctx.channelPost.photo as [{ file_id: string }];
    const caption = ctx.channelPost.caption;

    const formattedCaption = formatHtmlText(caption);

    await ctx.telegram.sendPhoto(targetChannel, _.last(photo).file_id, {
      caption: formattedCaption,
      parse_mode: "HTML",
    });
  } else if (ctx.channelPost.text) {
    const formattedText = formatHtmlText(toHTML(ctx.channelPost));
    await ctx.telegram.sendMessage(targetChannel, formattedText, {
      parse_mode: "HTML",
    });
  }
});

const formatHtmlText = (text: string) => {
  if (!text) return "";

  return text + "\n<b>Author Yurii</b>";
};

bot.launch();
