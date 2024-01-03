class LanguageModelService {
  private static api: Awaited<ReturnType<typeof LanguageModelService.init>>;

  public static async init() {
    const { ChatGPTAPI } = await import("chatgpt");

    const instance = new ChatGPTAPI({
      apiKey: process.env.OPEN_API_SECRET_KEY as string,
    });

    this.api = instance;

    return instance;
  }

  public static async sendMessage(
    message: string,
    { systemMessage }: { systemMessage?: string } = {}
  ) {
    const res = await this.api.sendMessage(message, { systemMessage });

    return res;
  }
}

export default LanguageModelService;
