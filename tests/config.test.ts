import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { readConfig } from "../app/config";
import { createLanguageModel } from "../app/ai/model";

test("validates required credentials without including their values in errors", () => {
  assert.throws(() => readConfig({}), /TELEGRAM_BOT_API_TOKEN/);
  assert.throws(() => readConfig({ TELEGRAM_BOT_API_TOKEN: "test-token" }), /OPENAI_API_KEY or OPEN_API_SECRET_KEY/);
  assert.throws(() => readConfig({ TELEGRAM_BOT_API_TOKEN: "  ", OPENAI_API_KEY: "test-key" }), /TELEGRAM_BOT_API_TOKEN/);
});

test("preserves defaults and legacy credentials", () => {
  const config = readConfig({ TELEGRAM_BOT_API_TOKEN: "test-token", OPEN_API_SECRET_KEY: "legacy-key" });
  assert.deepEqual(config, {
    telegramToken: "test-token", apiKey: "legacy-key", model: "gpt-6-luna", targetChannel: "@test_yuragon",
  });
  assert.equal(createLanguageModel(config).model, "gpt-6-luna");
});

test("standard credentials take priority and environment overrides are preserved", () => {
  const config = readConfig({
    TELEGRAM_BOT_API_TOKEN: "test-token", OPEN_API_SECRET_KEY: "legacy-key", OPENAI_API_KEY: "standard-key",
    LLM_MODEL: "custom-model", TARGET_CHANNEL: "@custom_channel",
  });
  assert.equal(config.apiKey, "standard-key");
  assert.equal(config.targetChannel, "@custom_channel");
  assert.equal(createLanguageModel(config).model, "custom-model");
});

test("startup with missing credentials exits with a nonzero code", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "app/index.ts"], {
    cwd: path.resolve(__dirname, ".."), encoding: "utf8",
    env: { ...process.env, TELEGRAM_BOT_API_TOKEN: "", OPENAI_API_KEY: "", OPEN_API_SECRET_KEY: "" },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Bot stopped/);
});
