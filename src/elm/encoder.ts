import * as ts from "typescript";
import { toValueCase, toTypeCase, introduce } from "./utils";
import { TransformError, nodeFromType } from "../error";

const todo = (name: string) => {
  console.warn(`${name} is not implemented for encoders`);
  return `Debug.todo "${name} is not implemented for encoders"`;
};

// Elm's layout parser is whitespace-sensitive: the only construct we emit that
// *requires* line breaks is `case`, whose branches must be indented strictly
// deeper than any enclosing branch. We thread `indent` (the column of this
// expression's case branches) through the recursion and bump it by `INDENT_STEP`
// whenever we descend into a case branch body, so arbitrarily nested unions stay
// well-indented. Everything else is emitted on a single line, which parses at any
// depth. `elm-format` reprints the result, so we only need it to parse.
const INDENT_STEP = 4;

export const buildEncoder = (
  type: ts.Type,
  value: string,
  checker: ts.TypeChecker,
  scope: Map<string, number>,
  indent = 8
): string => {
  let variable, newScope;
  const branchIndent = " ".repeat(indent);
  const error = (message: string): never => {
    throw new TransformError(nodeFromType(type), message);
  };
  switch (type.flags) {
    case ts.TypeFlags.Any:
      error("Any type is not supported: its shape is unknown so no encoder can be generated");
    case ts.TypeFlags.Unknown:
      error(
        "Unknown type is not supported: its shape is unknown so no encoder can be generated"
      );
    case ts.TypeFlags.String:
      return `Encode.string ${value}`;
    case ts.TypeFlags.Number:
      return `Encode.float ${value}`;
    case ts.TypeFlags.Boolean:
    case ts.TypeFlags.Boolean | ts.TypeFlags.Union:
      return `Encode.bool ${value}`;
    case ts.TypeFlags.Enum:
      return todo("Enum");

    case ts.TypeFlags.BigInt:
    case ts.TypeFlags.BigIntLiteral:
      error("BigInt type is not supported: Elm has no BigInt equivalent");
    case ts.TypeFlags.StringLiteral:
      return `Encode.string "${type.isStringLiteral() && type.value}"`;

    case ts.TypeFlags.NumberLiteral:
      return `Encode.float ${type.isNumberLiteral() && type.value}`;

    case ts.TypeFlags.BooleanLiteral:
      // TODO: Implement BooleanLiteral
      return `Encode.bool ${value}`;

    case ts.TypeFlags.ESSymbol:
    case ts.TypeFlags.UniqueESSymbol:
      error("Symbol type is not supported: symbols cannot be serialized to JSON");

    case ts.TypeFlags.Void:
    case ts.TypeFlags.Undefined:
    case ts.TypeFlags.Null:
      return `Encode.null`;
    case ts.TypeFlags.Never:
      error("Never type is not supported: it has no runtime representation");

    case ts.TypeFlags.TypeParameter:
      return todo("TypeParameter");
    case ts.TypeFlags.Object:
      if (checker.isArrayType(type)) {
        [variable, newScope] = introduce("el", scope);
        return `Encode.list (\\${variable} -> ${buildEncoder(
          checker.getTypeArguments(type as ts.TypeReference)[0],
          variable,
          checker,
          newScope,
          indent + INDENT_STEP
        )}) ${value}`;
      }

      const stringIndexType = checker.getIndexTypeOfType(
        type,
        ts.IndexKind.String
      );
      if (stringIndexType && checker.getPropertiesOfType(type).length === 0) {
        [variable, newScope] = introduce("v", scope);
        return `Encode.dict identity (\\${variable} -> ${buildEncoder(
          stringIndexType,
          variable,
          checker,
          newScope,
          indent + INDENT_STEP
        )}) ${value}`;
      }

      return `Encode.object [ ${checker
        .getPropertiesOfType(type)
        .map(
          (prop) =>
            `( "${prop.getName()}", ${buildEncoder(
              checker.getTypeOfSymbol(prop),
              `${value}.${toValueCase(prop.getName())}`,
              checker,
              scope,
              indent
            )} )`
        )
        .join(" , ")} ]`;

    case ts.TypeFlags.Union:
      let refType = (
        type.aliasSymbol
          ? checker.getDeclaredTypeOfSymbol(type.aliasSymbol)
          : type
      ) as ts.UnionType;
      if (
        refType.types.length === 2 &&
        refType.types.some((t) => t.flags === ts.TypeFlags.Undefined)
      ) {
        const subtype = refType.types.find(
          (t) => t.flags !== ts.TypeFlags.Undefined
        );
        [variable, newScope] = introduce(
          toValueCase(subtype.symbol?.name ?? "val"),
          scope
        );
        return `case (${value}) of
${branchIndent}Nothing -> Encode.null
${branchIndent}Just ${variable} -> ${buildEncoder(
          subtype,
          variable,
          checker,
          newScope,
          indent + INDENT_STEP
        )}`;
      }
      return `case (${value}) of
${branchIndent}${refType.types
        .map((t) => {
          if (t.isStringLiteral()) {
            return `${toTypeCase(t.value)} -> ${buildEncoder(
              t,
              value,
              checker,
              scope,
              indent + INDENT_STEP
            )}`;
          } else {
            let prop = t
              .getProperties()
              .map((sym) =>
                checker.getTypeOfSymbolAtLocation(sym, sym.valueDeclaration)
              )
              .find((ts) => ts.isStringLiteral())?.value;
            [variable, newScope] = introduce(toValueCase(prop), scope);

            return `${toTypeCase(prop)} ${variable} -> ${buildEncoder(
              t,
              variable,
              checker,
              newScope,
              indent + INDENT_STEP
            )}`;
          }
        })
        .join("\n" + branchIndent)}`;

    case ts.TypeFlags.Intersection:
      return `Encode.object [ ${checker
        .getPropertiesOfType(type)
        .map(
          (prop) =>
            `( "${prop.getName()}", ${buildEncoder(
              checker.getTypeOfSymbol(prop),
              `${value}.${toValueCase(prop.getName())}`,
              checker,
              scope,
              indent
            )} )`
        )
        .join(" , ")} ]`;

    // case ts.TypeFlags.Index:
    //   // TODO: ???
    //   return `Debug.todo`;

    // case ts.TypeFlags.Index:
    //   // TODO: ???
    //   return `Debug.todo`;

    // case ts.TypeFlags.IndexedAccess:
    //   // TODO: ???
    //   return `Debug.todo`;
    // case ts.TypeFlags.Conditional:
    //   // TODO: ???
    //   return `Debug.todo`;

    // case ts.TypeFlags.Substitution:
    //   // TODO: ???
    //   return `Debug.todo`;

    // case ts.TypeFlags.NonPrimitive:
    //   // TODO: ???
    //   return `Debug.todo`;

    // case ts.TypeFlags.TemplateLiteral:
    //   // TODO: ???
    //   return `Debug.todo`;

    // case ts.TypeFlags.StringMapping:
    //   // TODO: ???
    //   return `Debug.todo`;

    default:
      return error(
        `Advanced types not supported (${
          type.flags
        }): ${checker.typeToString(type)}`
      );
  }
};
