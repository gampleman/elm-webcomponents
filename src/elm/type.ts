import * as ts from "typescript";
import { toTypeCase, toValueCase } from "./utils";
import { TransformError } from "../error";

export type Type = {
  expression: string;
  definitions: Map<string, string>;
};

const elm = (
  strings: TemplateStringsArray,
  ...values: (Type | string)[]
): Type => {
  let expression = strings[0];
  for (let i = 0; i < values.length; i++) {
    let value = values[i];
    if (typeof value === "string") {
      expression += value;
    } else {
      expression += value.expression;
    }

    expression += strings[i + 1];
  }
  return {
    expression,
    definitions: new Map(
      values.flatMap((v) =>
        typeof v == "string" ? [] : Array.from(v.definitions?.entries())
      )
    ),
  };
};

const join = (types: Type[], sep: string): Type => {
  return elm`${types
    .map((t, i) => {
      if (i === 0) {
        return t;
      }
      return elm`${sep}${t}`;
    })
    .reduce((acc, t) => elm`${acc}${t}`, elm``)}`;
};

const buildObjectDefinition = (
  type: ts.Type,
  checker: ts.TypeChecker,
  lastNode: ts.Node
): Type => {
  return elm`{ ${join(
    checker.getPropertiesOfType(type).map((prop) => {
      return elm`${toValueCase(prop.getName())} : ${buildType(
        checker.getTypeAtLocation(prop.valueDeclaration),
        checker,
        lastNode
      )}`;
    }),
    ", "
  )} }`;
};

export const buildType = (
  type: ts.Type,
  checker: ts.TypeChecker,
  lastNode: ts.Node
): Type => {
  let node;
  if (type.symbol && type.symbol.getDeclarations()?.[0]) {
    node = type.symbol.getDeclarations()?.[0];
  } else if (type.aliasSymbol && type.aliasSymbol.getDeclarations()?.[0]) {
    node = type.aliasSymbol.getDeclarations()?.[0];
  } else {
    node = lastNode;
  }

  const error = (message: string) => {
    throw new TransformError(node, message);
  };

  const todo = (name: string) => error(`Type ${name} not implemented`);

  switch (type.flags) {
    case ts.TypeFlags.Any:
      error("Any type not supported");
    case ts.TypeFlags.Unknown:
      error(
        "The type was Unknown, but we need to know the type to infer the Elm type"
      );
    case ts.TypeFlags.String:
      return elm`String`;
    case ts.TypeFlags.Number:
      return elm`Float`;
    case ts.TypeFlags.Boolean:
    case ts.TypeFlags.Boolean | ts.TypeFlags.Union:
      return elm`Bool`;
    case ts.TypeFlags.Enum:
      return todo("Enum");

    case ts.TypeFlags.BigInt:
    case ts.TypeFlags.BigIntLiteral:
      error("BigInt type not supported");
    case ts.TypeFlags.StringLiteral:
      // TODO: Implement string encoder
      return elm`String`;

    case ts.TypeFlags.NumberLiteral:
      // TODO: Implement NumberLiteral
      return elm`Float`;

    case ts.TypeFlags.BooleanLiteral:
      // TODO: Implement BooleanLiteral
      return elm`Bool`;

    case ts.TypeFlags.ESSymbol:
    case ts.TypeFlags.UniqueESSymbol:
      error("Symbol type not supported");

    case ts.TypeFlags.Void:
    case ts.TypeFlags.Undefined:
    case ts.TypeFlags.Null:
    case ts.TypeFlags.Never:
      error("Emtpy/void types not supported");

    case ts.TypeFlags.TypeParameter:
      return elm`${toValueCase(type.symbol.name)}`;
    case ts.TypeFlags.Object:
      if (checker.isArrayType(type)) {
        return elm`List (${buildType(
          checker.getTypeArguments(type as ts.TypeReference)[0],
          checker,
          node
        )})`;
      }

      console.log(
        "target",
        checker.typeToString(type),
        (type as ts.ObjectType).objectFlags,
        type.aliasSymbol
      );
      if (type.aliasSymbol) {
        // let refType = checker.getSignaturesOfType(type, ts.SignatureKind.);
        // let refType = checker.getTypeAtLocation(
        //   (type.aliasSymbol.declarations?.[0] as ts.TypeAliasDeclaration).type!
        // );
        console.log(type.aliasSymbol);
        const args =
          type.aliasTypeArguments?.map((arg) =>
            buildType(arg, checker, node)
          ) ?? [];
        console.log(
          "declared",
          checker.getDeclaredTypeOfSymbol(type.aliasSymbol)
        );
        let refType = checker.getDeclaredTypeOfSymbol(type.aliasSymbol);
        // return;
        // console.log("refType", refType);
        let ref = elm`type alias ${toTypeCase(type.aliasSymbol.name)}${
          refType.aliasTypeArguments == null
            ? ""
            : " " +
              refType.aliasTypeArguments
                .map((arg): string => toValueCase(arg.symbol.name))
                .join(" ")
        } = ${buildObjectDefinition(refType, checker, node)}`;

        let begin = {
          expression: toTypeCase(type.aliasSymbol.name),
          definitions: new Map([
            [type.aliasSymbol.name, ref.expression],
            ...ref.definitions.entries(),
          ]),
        };

        return join([begin, ...args], " ");
      }

      let ref;
      switch ((type as ts.ObjectType).objectFlags) {
        case ts.ObjectFlags.Interface:
          ref = elm`type alias ${type.symbol.name} = ${buildObjectDefinition(
            type,
            checker,
            node
          )}`;
          return {
            expression: type.symbol.name,
            definitions: new Map([
              [type.symbol.name, ref.expression],
              ...ref.definitions,
            ]),
          };
        case ts.ObjectFlags.Reference:
          const t = type as ts.TypeReference;
          const args =
            t.typeArguments?.map((arg) => buildType(arg, checker, node)) ?? [];

          console.log(args);

          ref = elm`type alias ${toTypeCase(t.target.symbol.name)}${
            t.target.typeArguments == null
              ? ""
              : " " +
                t.target.typeArguments
                  .map((arg): string => toValueCase(arg.symbol.name))
                  .join(" ")
          } = ${buildObjectDefinition(t.target, checker, node)}`;

          let begin = {
            expression: toTypeCase(t.symbol.name),
            definitions: new Map([
              [t.target.symbol.name, ref.expression],
              ...ref.definitions.entries(),
            ]),
          };

          return join([begin, ...args], " ");
        case ts.ObjectFlags.ArrayLiteral:
          console.log("isArrray");
      }
      return buildObjectDefinition(type, checker, node);

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
