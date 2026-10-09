import { Telegraf, Context } from "telegraf";
import type { Message, Update, InputMediaPhoto, InputMediaVideo } from "telegraf/types";
import { debounce } from "lodash";
import type { DebouncedFunc } from "lodash";
import { toHTML } from "@telegraf/entity";

type AlbumMedia = InputMediaPhoto | InputMediaVideo;
type MediaMessage = Message.PhotoMessage | Message.VideoMessage;

export type MessageCopyData = {
  message: Message;
  chatId: string;
  updateText?: ({ html }: { html: string }) => string | Promise<string>;
};

export default class TelegramBot {
  public readonly instance: Telegraf;
  // shortcut: completed album IDs stay in memory until restart; replace with persistent deduplication when storage is added.
  private readonly mediaGroupStore = new Map<string, {
    data: AlbumMedia[];
    publish: DebouncedFunc<() => Promise<void>>;
    isUploadingFinished: boolean;
  }>();

  constructor(token: string) {
    this.instance = new Telegraf(token);
  }

  public get telegram() {
    return this.instance.telegram;
  }

  public init({ targetChannel, onUserStartBot, onTrackedChannelPost }: {
    targetChannel: string;
    onUserStartBot: (ctx: Context) => Promise<unknown>;
    onTrackedChannelPost: (ctx: Context<Update.ChannelPostUpdate>) => Promise<void>;
  }): Promise<void> {
    this.instance.catch((error, ctx) => {
      console.error("Telegram update failed", {
        updateId: ctx.update.update_id,
        error: error instanceof Error ? error.name : "UnknownError",
      });
    });
    this.instance.start(onUserStartBot);
    this.instance.on("channel_post", async (ctx) => {
      if (`@${ctx.channelPost.chat.username}` === targetChannel ||
        String(ctx.channelPost.chat.id) === targetChannel) return;

      await onTrackedChannelPost(ctx);
    });

    return this.instance.launch(() => console.info("Telegram bot connected"));
  }

  public async copyMessage({ message, chatId, updateText }: MessageCopyData): Promise<void> {
    if ("photo" in message || "video" in message) {
      if (message.media_group_id) {
        this.copyMediaGroupMessage(message, chatId, updateText);
        return;
      }

      const html = toHTML(message);
      const caption = updateText ? await updateText({ html }) : html;
      const options = { caption, parse_mode: "HTML" as const };
      if ("photo" in message) {
        await this.telegram.sendPhoto(chatId, this.photoFileId(message), options);
      } else {
        await this.telegram.sendVideo(chatId, message.video.file_id, options);
      }
    } else if ("text" in message) {
      const html = toHTML(message);
      const text = updateText ? await updateText({ html }) : html;
      if (text) await this.telegram.sendMessage(chatId, text, { parse_mode: "HTML" });
    }
  }

  private photoFileId(message: Message.PhotoMessage): string {
    const photo = message.photo.at(-1);
    if (!photo) throw new Error("Photo message contains no photos.");
    return photo.file_id;
  }

  private copyMediaGroupMessage(
    message: MediaMessage,
    chatId: string,
    updateText?: MessageCopyData["updateText"],
  ): void {
    const key = `${message.chat.id}:${chatId}:${message.media_group_id}`;
    let group = this.mediaGroupStore.get(key);
    if (!group) {
      group = {
        data: [],
        isUploadingFinished: false,
        publish: debounce(async () => {
          const album = this.mediaGroupStore.get(key);
          if (!album || album.isUploadingFinished) return;
          album.isUploadingFinished = true;
          try {
            const data = await Promise.all(album.data.map(async (item) => ({
              ...item,
              caption: updateText ? await updateText({ html: item.caption ?? "" }) : item.caption,
            })));
            await this.telegram.sendMediaGroup(chatId, data);
          } catch (error) {
            console.error("Telegram album skipped", {
              mediaGroupId: message.media_group_id,
              chatId,
              error: error instanceof Error ? error.name : "UnknownError",
            });
          } finally {
            album.data = [];
          }
        }, 1000),
      };
      this.mediaGroupStore.set(key, group);
    }
    if (group.isUploadingFinished) return;

    const caption = { caption: toHTML(message), parse_mode: "HTML" as const };
    group.data.push("photo" in message
      ? { type: "photo", media: this.photoFileId(message), ...caption }
      : { type: "video", media: message.video.file_id, ...caption });
    group.publish();
  }
}
