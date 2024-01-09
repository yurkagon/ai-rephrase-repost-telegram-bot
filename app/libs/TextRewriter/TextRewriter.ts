import fs from "fs";
import path from "path";

import LanguageModelService from "../../services/LanguageModelService";

class TextRewriter {
  private static readonly rewriteDescription = fs
    .readFileSync(path.resolve(__dirname, "./rewrite_description.txt"), "utf-8")
    .trim();

  public async rewriteTelegramHTML(text: string): Promise<string> {
    if (!this.isValidText(text)) return "";

    const response = await LanguageModelService.sendMessage(text, {
      systemMessage: TextRewriter.rewriteDescription,
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
