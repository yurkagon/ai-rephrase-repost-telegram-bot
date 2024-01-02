class TextRewriter {
  public async rewriteTelegramHTML(text: string): Promise<string> {
    if (!text) return "";

    return text + "\n<b>AI CHANGED LOGIC</b>";
  }
}

export default TextRewriter;
