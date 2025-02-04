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
  lastNode: ts.Node,
  filterOutLiterals: boolean
): Type => {
  return elm`{ ${join(
    checker
      .getPropertiesOfType(type)
      .filter(
        (prop) =>
          !filterOutLiterals ||
          !checker.getTypeAtLocation(prop.valueDeclaration!).isStringLiteral()
      )
      .map((prop) => {
        return elm`${toValueCase(prop.getName())} : ${buildType(
          checker.getTypeAtLocation(prop.valueDeclaration!),
          checker,
          lastNode,
          false
        )}`;
      }),
    ", "
  )} }`;
};

const buildDocs = (symbol: ts.Symbol, checker: ts.TypeChecker): string => {
  let docs =
    symbol
      ?.getDocumentationComment(checker)
      .filter((doc) => doc.kind === "text")
      .map((doc) => doc.text) ?? [];

  let docComment = "";

  if (docs.length > 0) {
    docComment = `{-| ${docs.join("\n")} -}\n`;
  }
  return docComment;
};

export const buildType = (
  type: ts.Type,
  checker: ts.TypeChecker,
  lastNode: ts.Node,
  filterOutLiterals = false
): Type => {
  let node: ts.Node;
  if (type.symbol && type.symbol.getDeclarations()?.[0]) {
    node = type.symbol.getDeclarations()?.[0]!;
  } else if (type.aliasSymbol && type.aliasSymbol.getDeclarations()?.[0]) {
    node = type.aliasSymbol.getDeclarations()?.[0]!;
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
      error("Emtpy/void types not supported");
    case ts.TypeFlags.Never:
      return elm`Never`;

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

      if (type.aliasSymbol) {
        const args =
          type.aliasTypeArguments?.map((arg) =>
            buildType(arg, checker, node)
          ) ?? [];

        let refType = checker.getDeclaredTypeOfSymbol(type.aliasSymbol);

        let ref = elm`${buildDocs(
          type.aliasSymbol,
          checker
        )}type alias ${toTypeCase(type.aliasSymbol.name)}${
          refType.aliasTypeArguments == null
            ? ""
            : " " +
              refType.aliasTypeArguments
                .map((arg): string => toValueCase(arg.symbol.name))
                .join(" ")
        } = ${buildObjectDefinition(
          refType,
          checker,
          node,
          filterOutLiterals
        )}`;

        let begin = {
          expression: toTypeCase(type.aliasSymbol.name),
          definitions: new Map([
            [toTypeCase(type.aliasSymbol.name), ref.expression],
            ...ref.definitions.entries(),
          ]),
        };

        return join([begin, ...args], " ");
      }

      let ref;
      switch ((type as ts.ObjectType).objectFlags) {
        case ts.ObjectFlags.Interface:
          ref = elm`${buildDocs(type.symbol, checker)}type alias ${toTypeCase(
            type.symbol.name
          )} = ${buildObjectDefinition(
            type,
            checker,
            node,
            filterOutLiterals
          )}`;
          return {
            expression: type.symbol.name,
            definitions: new Map([
              [toTypeCase(type.symbol.name), ref.expression],
              ...ref.definitions,
            ]),
          };
        case ts.ObjectFlags.Reference:
          const t = type as ts.TypeReference;
          const args =
            t.typeArguments?.map((arg) => buildType(arg, checker, node)) ?? [];

          ref = elm`${buildDocs(
            t.target.symbol,
            checker
          )}type alias ${toTypeCase(t.target.symbol.name)}${
            t.target.typeArguments == null
              ? ""
              : " " +
                t.target.typeArguments
                  .map((arg): string => toValueCase(arg.symbol.name))
                  .join(" ")
          } = ${buildObjectDefinition(
            t.target,
            checker,
            node,
            filterOutLiterals
          )}`;

          let begin = {
            expression: toTypeCase(t.symbol.name),
            definitions: new Map([
              [toTypeCase(t.target.symbol.name), ref.expression],
              ...ref.definitions.entries(),
            ]),
          };

          return join([begin, ...args], " ");
        case ts.ObjectFlags.ArrayLiteral:
          console.log("isArrray");
      }
      return buildObjectDefinition(type, checker, node, filterOutLiterals);

    case ts.TypeFlags.Union:
      if (type.aliasSymbol) {
        let refType = checker.getDeclaredTypeOfSymbol(
          type.aliasSymbol
        ) as ts.UnionType;

        if (
          refType.types.every(
            (t) =>
              t.isStringLiteral() ||
              t
                .getProperties()
                .some((sym) =>
                  checker
                    .getTypeOfSymbolAtLocation(sym, sym.valueDeclaration!)
                    .isStringLiteral()
                )
          )
        ) {
          let ref = elm`${buildDocs(
            type.aliasSymbol,
            checker
          )}type ${toTypeCase(type.aliasSymbol.name)} = ${join(
            refType.types.map((t) => {
              if (t.isStringLiteral()) {
                return elm`${toTypeCase(t.value)}`;
              }
              return elm`${toTypeCase(
                t
                  .getProperties()
                  .map(
                    (sym) =>
                      checker.getTypeOfSymbolAtLocation(
                        sym,
                        sym.valueDeclaration!
                      )!
                  )
                  .find((ts) => ts.isStringLiteral())?.value ?? ""
              )} (${buildType(t, checker, node, true)})`;
            }),
            " | "
          )}`;
          return {
            expression: toTypeCase(type.aliasSymbol.name),
            definitions: new Map([
              [toTypeCase(type.aliasSymbol.name) + "(..)", ref.expression],
              ...ref.definitions,
            ]),
          };
        } else
          error(`${checker.typeToString(type)} is not a supported Union type`);
      } else {
        let t = type as ts.UnionType;
        if (
          t.types.length === 2 &&
          t.types.some((t) => t.flags === ts.TypeFlags.Undefined)
        ) {
          const subtype = t.types.find(
            (t) => t.flags !== ts.TypeFlags.Undefined
          );
          return elm`Maybe (${buildType(subtype!, checker, node)})`;
        }
        error("Anonymous union types not supported");
      }

    case ts.TypeFlags.Intersection:
      return buildObjectDefinition(type, checker, node, false);

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
      error(
        `Advanced types not supported (${type.flags}): ${checker.typeToString(
          type
        )}`
      );
      return error(
        `Advanced types not supported (${type.flags}): ${checker.typeToString(
          type
        )}`
      );
  }
};
