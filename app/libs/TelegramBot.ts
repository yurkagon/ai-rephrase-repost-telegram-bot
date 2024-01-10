import { Telegraf, Context } from "telegraf";
import { message } from "telegraf/filters";
import { CommonMessageBundle } from "typegram";
import type { UnionToIntersection } from "utility-types";
import _ from "lodash";
import { toHTML } from "@telegraf/entity";

import TextRewriter from "./TextRewriter";

class TelegramBot {
  public instance = new Telegraf(process.env.TELEGRAM_BOT_API_TOKEN as string);

  private rewriter = new TextRewriter();

  private targetChannel: string;

  public get telegram() {
    return this.instance.telegram;
  }

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

    this.instance.use((ctx, next) => {
      if (ctx.message) {
        const userId = ctx.message.from.id;
        console.log("message", ctx.message.from.id);
      }

      if (ctx.channelPost) {
        console.log("channelPost", ctx.channelPost);
      }

      return next();
    });
    this.instance.start(onUserStartBot);
    this.instance.on(message("text"), onBotChatMessage);

    this.instance.on("channel_post", async (ctx) => {
      if (`@${ctx.channelPost.chat.username}` === this.targetChannel) return;

      return onTrackedChannelPost(ctx);
    });

    return this.instance.launch();
  }

  public async copyMessage(data: MessageCopyData) {
    if (data.message.media_group_id) {
      await this.copyMediaGroupMessage(data);
    } else if (data.message.photo) {
      await this.copySinglePhotoMessage(data);
    } else if (data.message.video) {
      await this.copySingleVideoMessage(data);
    } else if (data.message.text) {
      await this.copyTextMessage(data);
    }
  }

  private async copyTextMessage({
    message,
    chatId,
    updateText,
  }: MessageCopyData) {
    const html = toHTML(message);
    const formattedText = updateText ? await updateText({ html }) : html;

    await this.telegram.sendMessage(chatId, formattedText, {
      parse_mode: "HTML",
    });
  }

  private async copySinglePhotoMessage({
    message,
    chatId,
    updateText,
  }: MessageCopyData) {
    const html = toHTML({
      caption: message.caption,
      caption_entities: message.caption_entities,
    });
    const formattedCaption = updateText ? await updateText({ html }) : html;

    await this.telegram.sendPhoto(chatId, _.last(message.photo).file_id, {
      caption: formattedCaption,
      parse_mode: "HTML",
    });
  }

  private async copySingleVideoMessage({
    message,
    chatId,
    updateText,
  }: MessageCopyData) {
    const video = message.video;

    const html = toHTML({
      caption: message.caption,
      caption_entities: message.caption_entities,
    });
    const formattedCaption = updateText ? await updateText({ html }) : html;

    await this.telegram.sendVideo(chatId, video.file_id, {
      caption: formattedCaption,
      parse_mode: "HTML",
    });
  }

  private mediaGroupStore: Record<
    string,
    {
      data: any[];
      publish: () => Promise<void>;
      isUploadingFinished: boolean;
    }
  > = {};
  private async copyMediaGroupMessage({
    message,
    chatId,
    updateText,
  }: MessageCopyData) {
    const mediaGroupID = message.media_group_id;
    if (!this.mediaGroupStore[mediaGroupID]) {
      const mediaGroupStore = this.mediaGroupStore;

      mediaGroupStore[mediaGroupID] = {
        data: [],
        isUploadingFinished: false,
        publish: _.debounce(async () => {
          try {
            const data = await Promise.all(
              mediaGroupStore[mediaGroupID].data.map(async (item) => {
                const formattedCaption = updateText
                  ? await updateText({ html: item.caption })
                  : item.caption;

                return {
                  ...item,
                  caption: formattedCaption,
                };
              })
            );

            await this.telegram.sendMediaGroup(chatId, data);
          } catch {
          } finally {
            mediaGroupStore[mediaGroupID].isUploadingFinished = true;
          }
        }, 1000),
      };
    }

    if (this.mediaGroupStore[mediaGroupID].isUploadingFinished) return;

    const captionData = {
      caption: toHTML({
        caption: message.caption,
        caption_entities: message.caption_entities,
      }),
      parse_mode: "HTML",
    };

    const data = message.photo
      ? {
          type: "photo",
          media: _.last(message.photo).file_id,
        }
      : {
          type: "video",
          media: message.video.file_id,
        };

    this.mediaGroupStore[mediaGroupID].data.push({
      ...data,
      ...captionData,
    });

    await this.mediaGroupStore[mediaGroupID].publish();
  }
}

export type Message = UnionToIntersection<CommonMessageBundle>;
export type MessageCopyData = {
  message: Message;
  chatId: string;
  updateText?: ({ html }: { html: string }) => string | Promise<string>;
};

export default TelegramBot;
