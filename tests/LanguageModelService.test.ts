import assert from "node:assert/strict";
import test from "node:test";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessage, BaseMessage } from "@langchain/core/messages";
import type { ChatResult } from "@langchain/core/outputs";

import LanguageModelService from "../app/services/LanguageModelService";
import createLanguageModel from "../app/services/createLanguageModel";
import TextRewriter from "../app/libs/TextRewriter";

class StubChatModel extends BaseChatModel {
  public receivedMessages: BaseMessage[] = [];

  constructor(private readonly response: AIMessage | Error) {
    super({});
  }

  public _llmType() {
    return "stub";
  }

  public async _generate(messages: BaseMessage[]): Promise<ChatResult> {
    this.receivedMessages = messages;
    if (this.response instanceof Error) throw this.response;

    return { generations: [{ text: "", message: this.response }] };
  }
}

test("reports calls made before a model is initialized", async () => {
  await assert.rejects(
    LanguageModelService.sendMessage("Hello"),
    /must be initialized/
  );
});

test("preserves the system prompt and HTML when invoking a model", async () => {
  const model = new StubChatModel(new AIMessage("<b>Привіт</b>"));
  LanguageModelService.init(model);

  assert.equal(
    await LanguageModelService.sendMessage("<b>Hello</b>", {
      systemMessage: "Translate to Ukrainian and preserve HTML.",
    }),
    "<b>Привіт</b>"
  );
  assert.deepEqual(
    model.receivedMessages.map((message) => [message.type, message.content]),
    [
      ["system", "Translate to Ukrainian and preserve HTML."],
      ["human", "<b>Hello</b>"],
    ]
  );
});

test("extracts text blocks without publishing the model's reasoning", async () => {
  LanguageModelService.init(new StubChatModel(new AIMessage({
    content: [
      { type: "reasoning", reasoning: "Internal reasoning" },
      { type: "text", text: "Привіт, " },
      { type: "text", text: "світе!" },
    ],
  })));

  assert.equal(await LanguageModelService.sendMessage("Hello, world!"), "Привіт, світе!");
});

test("allows replacing a model without changing the caller", async () => {
  const first = new StubChatModel(new AIMessage("First response"));
  const second = new StubChatModel(new AIMessage("Second response"));
  LanguageModelService.init(first);
  assert.equal(await LanguageModelService.sendMessage("Hello"), "First response");
  LanguageModelService.init(second);
  assert.equal(await LanguageModelService.sendMessage("Hello"), "Second response");
  assert.deepEqual(second.receivedMessages.map((message) => message.type), ["human"]);
});

test("propagates provider failures to the caller", async () => {
  const error = new Error("Provider unavailable");
  LanguageModelService.init(new StubChatModel(error));

  await assert.rejects(LanguageModelService.sendMessage("Hello"), error);
});

test("rewriter uses the provider-independent text result and skips empty captions", async () => {
  const model = new StubChatModel(new AIMessage("<b>Переклад</b>"));
  LanguageModelService.init(model);
  const rewriter = new TextRewriter();

  assert.equal(await rewriter.rewriteTelegramHTML(""), "");
  assert.equal(model.receivedMessages.length, 0);
  assert.equal(await rewriter.rewriteTelegramHTML("<b>Translation</b>"), "<b>Переклад</b>");
  assert.equal(model.receivedMessages[0].type, "system");
  assert.ok(model.receivedMessages[0].content.toString().includes("HTML"));
});

test("factory supports existing credentials and configurable model names", () => {
  const keys = ["OPENAI_API_KEY", "OPEN_API_SECRET_KEY", "LLM_MODEL"];
  const previous = keys.map((key) => process.env[key]);
  try {
    keys.forEach((key) => delete process.env[key]);
    assert.throws(createLanguageModel, /Set OPENAI_API_KEY or OPEN_API_SECRET_KEY/);

    process.env.OPEN_API_SECRET_KEY = "test-legacy-key";
    assert.equal(createLanguageModel().invocationParams().model, "gpt-3.5-turbo");
    process.env.LLM_MODEL = "configured-model";
    assert.equal(createLanguageModel().invocationParams().model, "configured-model");

    delete process.env.OPEN_API_SECRET_KEY;
    process.env.OPENAI_API_KEY = "test-standard-key";
    assert.ok(createLanguageModel() instanceof BaseChatModel);
  } finally {
    keys.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
  }
});
