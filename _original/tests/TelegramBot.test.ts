import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { setImmediate } from "node:timers/promises";
import { Context } from "telegraf";
import type { Message, Update } from "telegraf/types";
import TelegramBot from "../app/libs/TelegramBot";
import TextRewriter from "../app/ai/TextRewriter";
import { createLanguageModel } from "../app/ai/model";
import App from "../app/app";

const common = {
  message_id: 1, date: 0,
  chat: { id: -100, type: "channel", title: "Source", username: "source" },
} as const;
const botInfo = {
  id: 1, is_bot: true, first_name: "Bot", username: "bot",
  can_join_groups: true, can_read_all_group_messages: false, supports_inline_queries: false,
} as const;

function text() {
  return { ...common, text: "Hello", entities: [{ type: "bold" as const, offset: 0, length: 5 }] };
}
function photo(caption?: string, media_group_id?: string, message_id = 1): Message.PhotoMessage {
  return {
    ...common, message_id, caption, media_group_id,
    photo: [
      { file_id: "small", file_unique_id: "s", width: 10, height: 10 },
      { file_id: "large", file_unique_id: "l", width: 100, height: 100 },
    ],
  };
}
function video(caption?: string, media_group_id?: string): Message.VideoMessage {
  return {
    ...common, message_id: 2, caption, media_group_id,
    video: { file_id: "video", file_unique_id: "v", width: 100, height: 100, duration: 1 },
  };
}

function setup(t: TestContext) {
  const bot = new TelegramBot("test-token");
  const sendText = t.mock.method(bot.telegram, "sendMessage", async () => ({}));
  const sendPhoto = t.mock.method(bot.telegram, "sendPhoto", async () => ({}));
  const sendVideo = t.mock.method(bot.telegram, "sendVideo", async () => ({}));
  const sendAlbum = t.mock.method(bot.telegram, "sendMediaGroup", async () => []);
  const errors = t.mock.method(console, "error", () => {});
  return { bot, sendText, sendPhoto, sendVideo, sendAlbum, errors };
}

test("publishes translated HTML for text, photos and videos", async (t) => {
  const { bot, sendText, sendPhoto, sendVideo } = setup(t);
  const received: string[] = [];
  const updateText = ({ html }: { html: string }) => {
    received.push(html);
    return "<b>Привіт</b>";
  };
  for (const message of [text(), photo("Hello"), video("Hello")]) {
    await bot.copyMessage({ message, chatId: "@target", updateText });
  }
  assert.deepEqual(received, ["<b>Hello</b>", "Hello", "Hello"]);
  assert.deepEqual(sendText.mock.calls[0].arguments, ["@target", "<b>Привіт</b>", { parse_mode: "HTML" }]);
  assert.deepEqual(sendPhoto.mock.calls[0].arguments, ["@target", "large", { caption: "<b>Привіт</b>", parse_mode: "HTML" }]);
  assert.deepEqual(sendVideo.mock.calls[0].arguments, ["@target", "video", { caption: "<b>Привіт</b>", parse_mode: "HTML" }]);
});

test("AI failures prevent publishing text, photos and videos", async (t) => {
  const { bot, sendText, sendPhoto, sendVideo } = setup(t);
  const error = new Error("AI unavailable");
  for (const message of [text(), photo("Hello"), video("Hello")]) {
    await assert.rejects(bot.copyMessage({
      message, chatId: "@target", updateText: async () => { throw error; },
    }), error);
  }
  assert.equal(sendText.mock.callCount(), 0);
  assert.equal(sendPhoto.mock.callCount(), 0);
  assert.equal(sendVideo.mock.callCount(), 0);
});

test("media without captions is published without an AI request", async (t) => {
  const { bot, sendPhoto, sendVideo } = setup(t);
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected network request"); });
  const rewriter = new TextRewriter(createLanguageModel({ apiKey: "test-key", model: "gpt-6-luna" }));
  for (const message of [photo(), video()]) {
    await bot.copyMessage({ message, chatId: "@target", updateText: ({ html }) => rewriter.rewriteTelegramHTML(html) });
  }
  assert.equal(fetch.mock.callCount(), 0);
  assert.equal(sendPhoto.mock.calls[0].arguments[2]?.caption, "");
  assert.equal(sendVideo.mock.calls[0].arguments[2]?.caption, "");
});

test("prepares every album caption before publishing once", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const { bot, sendAlbum } = setup(t);
  const seen: string[] = [];
  const updateText = async ({ html }: { html: string }) => {
    assert.equal(sendAlbum.mock.callCount(), 0);
    seen.push(html);
    return `Переклад ${html}`;
  };
  await bot.copyMessage({ message: photo("First", "album"), chatId: "@target", updateText });
  await bot.copyMessage({ message: video("Second", "album"), chatId: "@target", updateText });
  assert.equal(sendAlbum.mock.callCount(), 0);
  t.mock.timers.tick(1000);
  await setImmediate();
  assert.deepEqual(seen, ["First", "Second"]);
  assert.deepEqual(sendAlbum.mock.calls[0].arguments, ["@target", [
    { type: "photo", media: "large", caption: "Переклад First", parse_mode: "HTML" },
    { type: "video", media: "video", caption: "Переклад Second", parse_mode: "HTML" },
  ]]);
  await bot.copyMessage({ message: video("Second", "album"), chatId: "@target", updateText });
  t.mock.timers.tick(1000);
  await setImmediate();
  assert.equal(sendAlbum.mock.callCount(), 1);
});

test("an AI failure skips the whole album and logs no content", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const { bot, sendAlbum, errors } = setup(t);
  const updateText = async ({ html }: { html: string }) => {
    if (html === "Private caption") throw new Error("Private provider details");
    return "Переклад";
  };
  await bot.copyMessage({ message: photo("Hello", "album"), chatId: "@target", updateText });
  await bot.copyMessage({ message: video("Private caption", "album"), chatId: "@target", updateText });
  t.mock.timers.tick(1000);
  await setImmediate();
  assert.equal(sendAlbum.mock.callCount(), 0);
  assert.equal(errors.mock.callCount(), 1);
  assert.ok(!JSON.stringify(errors.mock.calls).includes("Private"));
});

test("an album without captions makes no AI requests", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const { bot, sendAlbum } = setup(t);
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected network request"); });
  const rewriter = new TextRewriter(createLanguageModel({ apiKey: "test-key", model: "gpt-6-luna" }));
  const updateText = ({ html }: { html: string }) => rewriter.rewriteTelegramHTML(html);
  await bot.copyMessage({ message: photo(undefined, "album"), chatId: "@target", updateText });
  await bot.copyMessage({ message: video(undefined, "album"), chatId: "@target", updateText });
  t.mock.timers.tick(1000);
  await setImmediate();
  assert.equal(fetch.mock.callCount(), 0);
  assert.equal(sendAlbum.mock.callCount(), 1);
});

test("updates arriving during caption generation do not publish the album twice", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const { bot, sendAlbum } = setup(t);
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => { finish = resolve; });
  const updateText = async () => { await pending; return "Переклад"; };
  await bot.copyMessage({ message: photo("Hello", "album"), chatId: "@target", updateText });
  await bot.copyMessage({ message: video("Hello", "album"), chatId: "@target", updateText });
  t.mock.timers.tick(1000);
  await setImmediate();
  await bot.copyMessage({ message: video("Hello", "album"), chatId: "@target", updateText });
  t.mock.timers.tick(1000);
  finish();
  await setImmediate();
  assert.equal(sendAlbum.mock.callCount(), 1);
});

test("catches update handler failures and skips posts from the destination", async (t) => {
  const { bot, errors } = setup(t);
  bot.instance.botInfo = botInfo;
  t.mock.method(bot.instance, "launch", async () => {});
  let calls = 0;
  await bot.init({
    targetChannel: "@source", onUserStartBot: async () => {},
    onTrackedChannelPost: async () => { calls++; throw new Error("Private content"); },
  });
  await bot.instance.handleUpdate({ update_id: 1, channel_post: text() });
  assert.equal(calls, 0);
  await bot.instance.handleUpdate({
    update_id: 2, channel_post: { ...text(), chat: { ...common.chat, username: "other" } },
  });
  assert.equal(calls, 1);
  assert.equal(errors.mock.callCount(), 1);
  assert.ok(!JSON.stringify(errors.mock.calls).includes("Private"));
});

test("App passes the caption through its injected rewriter", async (t) => {
  const { bot, sendText } = setup(t);
  const rewriter = new TextRewriter(createLanguageModel({ apiKey: "test-key", model: "gpt-6-luna" }));
  const rewrite = t.mock.method(rewriter, "rewriteTelegramHTML", async () => "Переклад");
  const init = t.mock.method(bot, "init", async () => {});
  await new App(bot, rewriter, "@target").run();
  const ctx = new Context<Update.ChannelPostUpdate>({ update_id: 1, channel_post: text() }, bot.telegram, botInfo);
  const options = init.mock.calls[0].arguments[0];
  assert.ok(options);
  await options.onTrackedChannelPost(ctx);
  assert.deepEqual(rewrite.mock.calls[0].arguments, ["<b>Hello</b>"]);
  assert.equal(sendText.mock.calls[0].arguments[0], "@target");
});
