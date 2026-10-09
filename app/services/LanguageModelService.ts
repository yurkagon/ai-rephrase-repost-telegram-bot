import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { BaseMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { ChatOpenAI } from "@langchain/openai";

class LanguageModelService {
  private static model: BaseChatModel;
  private static readonly outputParser = new StringOutputParser();

  public static init(model: BaseChatModel = this.createLanguageModel()) {
    this.model = model;

    return model;
  }

  private static createLanguageModel(): BaseChatModel {
    const apiKey = process.env.OPENAI_API_KEY || process.env.OPEN_API_SECRET_KEY;
    if (!apiKey) {
      throw new Error("Set OPENAI_API_KEY or OPEN_API_SECRET_KEY to use the OpenAI model.");
    }

    return new ChatOpenAI({
      apiKey,
      model: process.env.LLM_MODEL || "gpt-3.5-turbo",
    });
  }

  public static async sendMessage(
    message: string,
    { systemMessage }: { systemMessage?: string } = {}
  ): Promise<string> {
    if (!this.model) {
      throw new Error("LanguageModelService must be initialized before sending messages.");
    }

    const messages: BaseMessage[] = [];
    if (systemMessage) messages.push(new SystemMessage(systemMessage));
    messages.push(new HumanMessage(message));

    const response = await this.model.invoke(messages);

    return this.outputParser.invoke(response);
  }
}

export default LanguageModelService;
