import * as ts from "typescript";

export const buildType = (type: ts.Type, checker: ts.TypeChecker): string => {
  const todo = (name: string) => {
    console.warn(
      `${name} : ${checker.typeToString(type)} is not implemented for types`
    );
    throw new Error(`${name} is not implemented for types`);
  };
  console.log("building type", checker.typeToString(type));

  switch (type.flags) {
    case ts.TypeFlags.Any:
      throw new Error("Any type not supported");
    case ts.TypeFlags.Unknown:
      throw new Error(
        "The type was Unknown, but we need to know the type to infer an encoder"
      );
    case ts.TypeFlags.String:
      return `String`;
    case ts.TypeFlags.Number:
      return `Float`;
    case ts.TypeFlags.Boolean:
    case ts.TypeFlags.Boolean | ts.TypeFlags.Union:
      return `Bool`;
    case ts.TypeFlags.Enum:
      return todo("Enum");

    case ts.TypeFlags.BigInt:
    case ts.TypeFlags.BigIntLiteral:
      throw new Error("BigInt type not supported");
    case ts.TypeFlags.StringLiteral:
      // TODO: Implement string encoder
      return `String`;

    case ts.TypeFlags.NumberLiteral:
      // TODO: Implement NumberLiteral
      return `Float`;

    case ts.TypeFlags.BooleanLiteral:
      // TODO: Implement BooleanLiteral
      return `Bool`;

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
      if (checker.isArrayType(type)) {
        return `List (${buildType(
          checker.getTypeArguments(type as ts.TypeReference)[0],
          checker
        )})`;
      }
      // switch ((type as ts.ObjectType).objectFlags) {
      //   case ts.ObjectFlags.Reference:
      //     const t = type as ts.TypeReference;
      //     console.log(
      //       "target",
      //       checker.typeToString(t.target),
      //       (t.target as ts.TypeReference).node
      //     );

      //     console.log("node", t.node);
      //     break;
      //   case ts.ObjectFlags.ArrayLiteral:
      //     console.log("isArrray");
      // }
      return `{ ${checker
        .getPropertiesOfType(type)
        .map((prop) => {
          console.log("prop", prop.getName(), prop);
          console.log(checker.getTypeAtLocation(prop.valueDeclaration));
          return `${prop.getName()} : ${buildType(
            checker.getTypeAtLocation(prop.valueDeclaration),
            checker
          )}`;
        })
        .join(", ")} }`;

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
      throw new Error(
        `Advanced types not supported (${type.flags}): ${checker.typeToString(
          type
        )}`
      );
  }
};
