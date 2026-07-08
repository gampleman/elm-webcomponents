import { capitalize, camel, pascal, title } from "radash";
import * as ts from "typescript";

export type EnumMember = {
  /** The Elm custom-type constructor name, e.g. `Red`. */
  ctor: string;
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
 * The type-annotation node of a property (e.g. the `Size` in `size: Size`),
 * used to recover alias names that TypeScript resolves away (template literals).
 * Returns `undefined` when the property has no explicit type node.
 */
export const propertyTypeNode = (prop: ts.Symbol): ts.Node | undefined => {
  const declaration = prop.valueDeclaration;
  if (
    declaration &&
    (ts.isPropertySignature(declaration) ||
      ts.isPropertyDeclaration(declaration)) &&
    declaration.type
  ) {
    return declaration.type;
  }
  return undefined;
};

/** The brand property carried by the library's `Int` type. */
const ELM_INT_BRAND = "__elmInt__";

/**
 * Detects the library's branded `Int` type (`number & { __elmInt__?: never }`),
 * which the user uses to request an Elm `Int` instead of a `Float`. It presents
 * to the checker as an intersection of a `number` and a brand object carrying
 * the {@link ELM_INT_BRAND} property, and is detected structurally so it also
 * works when nested inside records, tuples, arrays, etc.
 */
export const isElmInt = (type: ts.Type, checker: ts.TypeChecker): boolean => {
  if (!type.isIntersection()) {
    return false;
  }
  const hasNumber = type.types.some((m) => (m.flags & ts.TypeFlags.Number) !== 0);
  const hasBrand = type.types.some((m) =>
    checker.getPropertiesOfType(m).some((p) => p.getName() === ELM_INT_BRAND)
  );
  return hasNumber && hasBrand;
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

export type TemplateLiteralInfo = {
  /** Whether this template literal maps to a supported opaque Elm newtype. */
  supported: boolean;
  /** When unsupported, a human-readable explanation for the error. */
  reason?: string;
  /** Opaque Elm type name, e.g. `ItemId` (present when supported). */
  name?: string;
  /** Smart-constructor name, e.g. `itemId` (present when supported). */
  ctor?: string;
  /** The original TS pattern, e.g. `` `item-${string}` ``. */
  pattern?: string;
  /**
   * Boolean Elm expression validating a `String` bound to `raw`, e.g.
   * `String.startsWith "item-" raw` (present when supported).
   */
  validator?: string;
};

/**
 * Classifies a TypeScript template-literal type (e.g. `` `item-${string}` ``).
 * Returns `null` when `type` is not a template literal. When it is, only the
 * "core" tier is supported for now: a single `string`/`number` placeholder in a
 * type that is behind a named alias, with at least one literal anchor. Such a
 * type maps to an opaque Elm newtype with a `Maybe`-returning smart constructor
 * that rejects strings not matching the pattern, validated with `elm/core`
 * String functions (no extra dependency). Anything else returns
 * `{ supported: false }` with a human-readable reason.
 */
export const templateLiteralInfo = (
  type: ts.Type,
  checker: ts.TypeChecker,
  node?: ts.Node
): TemplateLiteralInfo | null => {
  if (!(type.flags & ts.TypeFlags.TemplateLiteral)) {
    return null;
  }
  const tl = type as ts.TemplateLiteralType;
  const patternText = checker.typeToString(type);

  // TypeScript eagerly resolves template-literal aliases and drops the
  // aliasSymbol, so the alias name only survives on the referencing node (a
  // `type Foo = ...` used as `Foo`). Recover it from there — but only when the
  // node genuinely resolves to *this* type, so we never mislabel a nested
  // template literal with an enclosing type's name. Without a name we have
  // nothing to call the opaque Elm type, so it is unsupported.
  const aliasName =
    node &&
    ts.isTypeReferenceNode(node) &&
    checker.getTypeAtLocation(node) === type
      ? checker.getSymbolAtLocation(node.typeName)?.name
      : undefined;
  if (!aliasName) {
    return {
      supported: false,
      reason: `anonymous template literal types are not supported; declare it as a named \`type\` and refer to it by name (pattern: ${patternText})`,
    };
  }
  if (tl.types.length !== 1) {
    return {
      supported: false,
      reason: `template literal types with more than one placeholder are not yet supported (pattern: ${patternText})`,
    };
  }

  const placeholder = tl.types[0];
  const isNumber = (placeholder.flags & ts.TypeFlags.Number) !== 0;
  const isString = (placeholder.flags & ts.TypeFlags.String) !== 0;
  if (!isNumber && !isString) {
    return {
      supported: false,
      reason: `only \`string\` and \`number\` template-literal placeholders are supported (pattern: ${patternText})`,
    };
  }

  const prefix = tl.texts[0];
  const suffix = tl.texts[1];
  if (!prefix && !suffix) {
    return {
      supported: false,
      reason: `unanchored template literal is equivalent to a plain \`${
        isNumber ? "number" : "string"
      }\` and adds no constraint (pattern: ${patternText})`,
    };
  }

  const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const checks: string[] = [];
  if (prefix) checks.push(`String.startsWith "${escape(prefix)}" raw`);
  if (suffix) checks.push(`String.endsWith "${escape(suffix)}" raw`);
  if (prefix && suffix) {
    // Guard against prefix/suffix overlapping on a too-short string.
    checks.push(`String.length raw >= ${prefix.length + suffix.length}`);
  }
  if (isNumber) {
    // The span between the anchors must itself parse as a number.
    let expr = "raw";
    if (suffix) expr = `String.dropRight ${suffix.length} (${expr})`;
    if (prefix) expr = `String.dropLeft ${prefix.length} (${expr})`;
    checks.push(`(String.toFloat (${expr}) /= Nothing)`);
  }

  return {
    supported: true,
    name: toTypeCase(aliasName),
    ctor: toValueCase(aliasName),
    pattern: patternText,
    validator: checks.join(" && "),
  };
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
      ctor: toTypeCase(member.symbol?.name ?? ""),
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
