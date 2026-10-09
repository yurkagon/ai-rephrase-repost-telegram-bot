import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatOpenAI } from "@langchain/openai";

export default function createLanguageModel(): BaseChatModel {
  const apiKey = process.env.OPENAI_API_KEY || process.env.OPEN_API_SECRET_KEY;
  if (!apiKey) {
    throw new Error("Set OPENAI_API_KEY or OPEN_API_SECRET_KEY to use the OpenAI model.");
  }

  return new ChatOpenAI({
    apiKey,
    model: process.env.LLM_MODEL || "gpt-3.5-turbo",
  });
}
