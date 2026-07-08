import { capitalize, camel, pascal, title } from "radash";
import * as ts from "typescript";

export type EnumMember = {
  /** The Elm custom-type constructor name, e.g. `Red`. */
  constructor: string;
  /** The value each member serializes to (string enums) or its ordinal (numeric enums). */
  value: string | number;
};

export type EnumInfo = {
  /** Elm type name, e.g. `Color`. */
  name: string;
  members: EnumMember[];
  /** Whether members serialize to JSON strings (vs. numbers). */
  isString: boolean;
};

/**
 * If `type` is a TypeScript tuple (`[A, B]`, `[x: number, y: number]`, ...),
 * returns its element types; otherwise `null`. Elm only has 2- and 3-tuples,
 * so callers must reject other arities.
 */
export const tupleElements = (
  type: ts.Type,
  checker: ts.TypeChecker
): ts.Type[] | null => {
  if (!checker.isTupleType(type)) {
    return null;
  }
  return checker.getTypeArguments(type as ts.TypeReference).slice();
};

/**
 * A TypeScript `enum` presents to the checker as a `Union` of `EnumLiteral`
 * members rather than `TypeFlags.Enum`. When `type` is such a union this returns
 * the info needed to generate an Elm custom type, encoder and decoder; otherwise
 * it returns `null`.
 */
export const enumInfo = (
  type: ts.Type,
  checker: ts.TypeChecker
): EnumInfo | null => {
  if (!(type.flags & ts.TypeFlags.EnumLiteral) || !type.isUnion()) {
    return null;
  }
  const symbol = type.aliasSymbol ?? type.symbol;
  if (!symbol) {
    return null;
  }
  const members = type.types.map((member): EnumMember => {
    const literal = member as ts.LiteralType;
    return {
      constructor: toTypeCase(member.symbol?.name ?? ""),
      value: literal.value as string | number,
    };
  });
  return {
    name: toTypeCase(symbol.name),
    members,
    isString: type.types.every((member) => member.isStringLiteral()),
  };
};

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
