import { capitalize, camel, pascal, title } from "radash";

const reservedWords = new Set([
  "if",
  "then",
  "else",
  "case",
  "of",
  "let",
  "in",
  "type",
  "module",
  "where",
  "import",
  "exposing",
  "as",
  "port",
]);

export const toValueCase = (str: string) => {
  const candidate = camel(title(str));
  if (reservedWords.has(candidate)) {
    return candidate + "_";
  }
  return candidate;
};

export const toTypeCase = (str: string) => {
  return pascal(title(str));
};
