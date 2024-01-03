import LanguageModelService from "../services/LanguageModelService";

class TextRewriter {
  private parentMessageId: string = "9dc54f8c-6ba6-4195-9ec0-c0452f89e9b7";

  public async rewriteTelegramHTML(text: string): Promise<string> {
    if (!this.isValidText(text)) return "";


    const parentMessageId = await this.getParentMessageId();

    const response = await LanguageModelService.sendMessage(text, {
      parentMessageId,
    });

    return response.text;
  }

  private isValidText(text: string): boolean {
    if (!text) return false;
    if (text.length < 2) return false;

    return true;
  }

  private async getParentMessageId() {
    if (this.parentMessageId) return this.parentMessageId;

    const response = await LanguageModelService.sendMessage(
      `Якщо текст україньскою мовою, то зробити невеликий рерайт
      Якщо мова інша: просто перклад на українську
      Якщо текст у форматі HTML то зберігати теги
      Не писати більше нічого крім результату

      Надалі скидуватиму тексти
      `
    );
    console.log(response)

    console.info("Conversation created", response.parentMessageId);

    this.parentMessageId = response.parentMessageId;

    return this.parentMessageId;
  }

}

export default TextRewriter;
