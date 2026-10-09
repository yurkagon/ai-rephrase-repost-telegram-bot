import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { BaseMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { StringOutputParser } from "@langchain/core/output_parsers";

class LanguageModelService {
  private static model: BaseChatModel;
  private static readonly outputParser = new StringOutputParser();

  public static init(model: BaseChatModel) {
    this.model = model;

    return model;
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
