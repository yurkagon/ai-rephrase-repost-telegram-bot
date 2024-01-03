import LanguageModelService from "../services/LanguageModelService";

class TextRewriter {
  private readonly systemMessage = `
    Якщо текст україньскою мовою, то зробити невеликий рерайт
    Якщо мова інша: просто перклад на українську
    HTML теги і посилання нехай будуть в результуючому тексті
    Видалити підпис з посиланням джерела, якщо присутнє в кінці
    Не писати більше нічого крім результату
    `.trim();

  public async rewriteTelegramHTML(text: string): Promise<string> {
    if (!this.isValidText(text)) return "";

    const response = await LanguageModelService.sendMessage(text, {
      systemMessage: this.systemMessage,
    });

    return response.text;
  }

  private isValidText(text: string): boolean {
    if (!text) return false;
    if (text.length < 2) return false;

    return true;
  }
}

export default TextRewriter;
