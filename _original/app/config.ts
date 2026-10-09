export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const telegramToken = env.TELEGRAM_BOT_API_TOKEN?.trim();
  const apiKey = env.OPENAI_API_KEY?.trim() || env.OPEN_API_SECRET_KEY?.trim();

  if (!telegramToken) throw new Error("Set TELEGRAM_BOT_API_TOKEN to run the bot.");
  if (!apiKey) throw new Error("Set OPENAI_API_KEY or OPEN_API_SECRET_KEY to use the AI model.");

  return {
    telegramToken,
    apiKey,
    model: env.LLM_MODEL?.trim() || "gpt-6-luna",
    targetChannel: env.TARGET_CHANNEL?.trim() || "@test_yuragon",
  };
}

export type Config = ReturnType<typeof readConfig>;
