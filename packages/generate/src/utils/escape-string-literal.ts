export function escapeStringLiteral(value: string): string {
  let escaped = "";

  for (const char of value) {
    switch (char) {
      case "\\":
        escaped += "\\\\";
        break;
      case "'":
        escaped += "\\'";
        break;
      case "\n":
        escaped += "\\n";
        break;
      case "\r":
        escaped += "\\r";
        break;
      case "\t":
        escaped += "\\t";
        break;
      default: {
        const code = char.charCodeAt(0);
        escaped += code <= 0x1f ? `\\x${code.toString(16).padStart(2, "0")}` : char;
      }
    }
  }

  return escaped;
}
