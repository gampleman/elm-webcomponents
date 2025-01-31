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
export const introduce = (
  name: string,
  scope: Map<string, number>
): [name: string, scope: Map<string, number>] => {
  let num = scope.get(name);
  if (num != null) {
    scope.set(name, num + 1);
    return [`${name}${num + 1}`, scope];
  } else {
    let newScope = new Map(scope);
    newScope.set(name, 0);
    return [name, newScope];
  }
};

export const buildScope = (names: string[]): Map<string, number> => {
  let result = new Map<string, number>();
  for (let name of names) {
    let match = name.match(/.+?(\d+)$/);
    let num = 0;
    if (match != null) {
      name = name.slice(0, -match[1].length);
      num = parseInt(match[1]);
    }
    if (result.has(name)) {
      result.set(name, Math.max(result.get(name)!, num));
    } else {
      result.set(name, num);
    }
  }
  return result;
};
