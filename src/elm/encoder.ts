import * as ts from "typescript";
import { toValueCase, toTypeCase, introduce } from "./utils";

const todo = (name: string) => {
  console.warn(`${name} is not implemented for encoders`);
  return `Debug.todo "${name} is not implemented for encoders"`;
};

export const buildEncoder = (
  type: ts.Type,
  value: string,
  checker: ts.TypeChecker,
  scope: Map<string, number>
): string => {
  let variable, newScope;
  switch (type.flags) {
    case ts.TypeFlags.Any:
      throw new Error("Any type not supported");
    case ts.TypeFlags.Unknown:
      throw new Error(
        "The type was Unknown, but we need to know the type to infer an encoder"
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
      throw new Error("BigInt type not supported");
    case ts.TypeFlags.StringLiteral:
      return `Encode.string "${type.isStringLiteral() && type.value}"`;

    case ts.TypeFlags.NumberLiteral:
      return `Encode.float ${type.isNumberLiteral() && type.value}`;

    case ts.TypeFlags.BooleanLiteral:
      // TODO: Implement BooleanLiteral
      return `Encode.bool ${value}`;

    case ts.TypeFlags.ESSymbol:
    case ts.TypeFlags.UniqueESSymbol:
      throw new Error("Any type not supported");

    case ts.TypeFlags.Void:
    case ts.TypeFlags.Undefined:
    case ts.TypeFlags.Null:
      return `Encode.null`;
    case ts.TypeFlags.Never:
      throw new Error("Emtpy/void types not supported");

    case ts.TypeFlags.TypeParameter:
      return todo("TypeParameter");
    case ts.TypeFlags.Object:
      if (checker.isArrayType(type)) {
        [variable, newScope] = introduce("el", scope);
        return `Encode.list (\\${variable} -> ${buildEncoder(
          checker.getTypeArguments(type as ts.TypeReference)[0],
          variable,
          checker,
          newScope
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
              scope
            )} )`
        )
        .join("\n    , ")}]`;

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
    Nothing -> Encode.null
    Just ${variable} -> ${buildEncoder(subtype, variable, checker, newScope)}
`;
      }
      return `case (${value}) of
        ${refType.types
          .map((t) => {
            if (t.isStringLiteral()) {
              return `${toTypeCase(t.value)} -> ${buildEncoder(
                t,
                value,
                checker,
                scope
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
                newScope
              )}`;
            }
          })
          .join("\n        ")}`;

    case ts.TypeFlags.Intersection:
      return `Encode.object [ ${checker
        .getPropertiesOfType(type)
        .map(
          (prop) =>
            `( "${prop.getName()}", ${buildEncoder(
              checker.getTypeOfSymbol(prop),
              `${value}.${toValueCase(prop.getName())}`,
              checker,
              scope
            )} )`
        )
        .join("\n    , ")}]`;

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
      throw new Error("Advanced types not supported");
  }
};
