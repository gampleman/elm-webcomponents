import * as ts from "typescript";

const todo = (name: string) => {
  console.warn(`${name} is not implemented for decoders`);
  return `Debug.todo "${name} is not implemented for decoders"`;
};

export const buildDecoder = (
  type: ts.Type,
  checker: ts.TypeChecker
): string => {
  switch (type.flags) {
    case ts.TypeFlags.Any:
      throw new Error("Any type not supported");
    case ts.TypeFlags.Unknown:
      throw new Error(
        "The type was Unknown, but we need to know the type to infer an encoder"
      );
    case ts.TypeFlags.String:
      return `Decode.string`;
    case ts.TypeFlags.Number:
      return `Decode.float`;
    case ts.TypeFlags.Boolean:
      return `Decode.bool`;
    case ts.TypeFlags.Enum:
      return todo("Enum");

    case ts.TypeFlags.BigInt:
    case ts.TypeFlags.BigIntLiteral:
      throw new Error("BigInt type not supported");
    case ts.TypeFlags.StringLiteral:
      // TODO: Implement string encoder
      return `Decode.string`;

    case ts.TypeFlags.NumberLiteral:
      // TODO: Implement NumberLiteral
      return `Decode.float`;

    case ts.TypeFlags.BooleanLiteral:
      // TODO: Implement BooleanLiteral
      return `Decode.bool`;

    case ts.TypeFlags.ESSymbol:
    case ts.TypeFlags.UniqueESSymbol:
      throw new Error("Symbol type not supported");

    case ts.TypeFlags.Void:
    case ts.TypeFlags.Undefined:
    case ts.TypeFlags.Null:
    case ts.TypeFlags.Never:
      throw new Error("Emtpy/void types not supported");

    case ts.TypeFlags.TypeParameter:
      return todo("TypeParameter");
    case ts.TypeFlags.Object:
      const properties = checker.getPropertiesOfType(type);
      const propNames = properties.map((prop) => prop.getName());
      return `Decode.succeed (\\${propNames.join(" ")} -> { ${propNames
        .map((prop) => `${prop} = ${prop}`)
        .join(", ")} })
      ${properties
        .map(
          (prop) =>
            `|> Decode.map2 (<|) (Decode.field "${prop.getName()}" ${buildDecoder(
              checker.getTypeAtLocation(prop.valueDeclaration),
              checker
            )})`
        )
        .join("\n      ")}`;

    case ts.TypeFlags.Union:
      return todo("Union");

    // case ts.TypeFlags.Intersection:
    //   // TODO: ???
    //   return `Debug.todo`;

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
