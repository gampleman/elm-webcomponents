import * as ts from "typescript";

const todo = (name: string) => {
  console.warn(`${name} is not implemented for encoders`);
  return `Debug.todo "${name} is not implemented for encoders"`;
};

export const buildEncoder = (
  type: ts.Type,
  value: string,
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
      return `Encode.string ${value}`;
    case ts.TypeFlags.Number:
      console.log("number", checker.typeToString(type));
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
      // TODO: Implement string encoder
      return `Encode.string ${value}`;

    case ts.TypeFlags.NumberLiteral:
      // TODO: Implement NumberLiteral
      return `Encode.float ${value}`;

    case ts.TypeFlags.BooleanLiteral:
      // TODO: Implement BooleanLiteral
      return `Encode.bool ${value}`;

    case ts.TypeFlags.ESSymbol:
    case ts.TypeFlags.UniqueESSymbol:
      throw new Error("Any type not supported");

    case ts.TypeFlags.Void:
    case ts.TypeFlags.Undefined:
    case ts.TypeFlags.Null:
    case ts.TypeFlags.Never:
      throw new Error("Emtpy/void types not supported");

    case ts.TypeFlags.TypeParameter:
      return todo("TypeParameter");
    case ts.TypeFlags.Object:
      if (checker.isArrayType(type)) {
        return `Encode.list (\\el -> ${buildEncoder(
          checker.getTypeArguments(type as ts.TypeReference)[0],
          "el",
          checker
        )})) ${value}`;
      }

      return `Encode.object [ ${checker
        .getPropertiesOfType(type)
        .map(
          (prop) =>
            `( "${prop.getName()}", ${buildEncoder(
              checker.getTypeAtLocation(prop.valueDeclaration),
              `${value}.${prop.getName()}`,
              checker
            )} )`
        )
        .join("\n    , ")}}]`;

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
