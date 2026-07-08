import * as ts from "typescript";
import {
  toTypeCase,
  toValueCase,
  enumInfo,
  tupleElements,
  templateLiteralInfo,
  propertyTypeNode,
  isElmInt,
} from "./utils";
import { TransformError, nodeFromType } from "../error";

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
  filterOutLiterals: boolean,
  inbound = false
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
          // Prefer the property's own type-reference node so nested types that
          // rely on their reference site (e.g. template literals) resolve their
          // name; fall back to the enclosing node otherwise.
          propertyTypeNode(prop) ?? lastNode,
          false,
          inbound
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
  filterOutLiterals = false,
  // When the value flows *into* Elm (an event payload we decode) rather than
  // out of it, template literal types become a plain `String`: the opaque
  // newtype's constructor is not exposed, so a decoded opaque value would be
  // useless to the user. Outbound (property) values keep the validating newtype.
  inbound = false
): Type => {
  // Blame the type's own declaration when it lives in the user's code,
  // otherwise fall back to the referencing node so errors never point into
  // library `.d.ts` files (e.g. the definition of `Record` or `Array`).
  const node = nodeFromType(type, lastNode) ?? lastNode;

  const error = (message: string): never => {
    throw new TransformError(node, message);
  };

  // The branded `Int` type presents as an intersection (number & brand), so it
  // is detected before both the flag switch and the Intersection→record case.
  if (isElmInt(type, checker)) {
    return elm`Int`;
  }

  // A TypeScript `enum` arrives as a union of EnumLiteral members (not
  // TypeFlags.Enum), so it is detected before the flag switch. It becomes an
  // Elm custom type with one nullary constructor per member.
  const enumType = enumInfo(type, checker);
  if (enumType) {
    const docs = buildDocs(
      (type.aliasSymbol ?? type.symbol)!,
      checker
    );
    const definition = `${docs}type ${enumType.name} = ${enumType.members
      .map((member) => member.ctor)
      .join(" | ")}`;
    return {
      expression: enumType.name,
      definitions: new Map([[enumType.name + "(..)", definition]]),
    };
  }

  // A template literal type (e.g. `` `item-${string}` ``) becomes an opaque Elm
  // newtype guarded by a smart constructor that rejects non-matching strings.
  // The type is exposed opaquely (no `(..)`), alongside its constructor.
  const templateLiteral = templateLiteralInfo(type, checker, lastNode);
  if (templateLiteral) {
    // Inbound: the user receives the value but can't unwrap an opaque type, so
    // hand them a plain String (matching the decoder, which decodes a String).
    // Any template literal is a string at runtime, so this works regardless of
    // whether the outbound opaque-newtype form would be supported.
    if (inbound) {
      return elm`String`;
    }
    if (!templateLiteral.supported) {
      return error(templateLiteral.reason);
    }
    const { name, ctor, pattern, validator } = templateLiteral;
    const typeDef = `type ${name}
    = ${name} String`;
    const ctorDef = `{-| Build a \`${name}\` from a \`String\`, returning \`Nothing\` if it does not match the TypeScript type ${pattern}. -}
${ctor} : String -> Maybe ${name}
${ctor} raw =
    if ${validator} then
        Just (${name} raw)

    else
        Nothing`;
    return {
      expression: name,
      definitions: new Map([
        [name, typeDef],
        [ctor, ctorDef],
      ]),
    };
  }

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
    // Enums are handled by the enumInfo guard above; they never reach here with
    // a bare TypeFlags.Enum, so there is no case for it.

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
      error("Void/undefined/null types are not supported as a type on their own");
    case ts.TypeFlags.Never:
      return elm`Never`;

    case ts.TypeFlags.TypeParameter:
      return elm`${toValueCase(type.symbol.name)}`;
    case ts.TypeFlags.Object:
      if (checker.isArrayType(type)) {
        return elm`List (${buildType(
          checker.getTypeArguments(type as ts.TypeReference)[0],
          checker,
          node,
          false,
          inbound
        )})`;
      }

      // A TypeScript tuple maps to an Elm tuple. Elm only has 2- and 3-tuples,
      // so other arities are rejected.
      const tupleTypes = tupleElements(type, checker);
      if (tupleTypes) {
        if (tupleTypes.length < 2 || tupleTypes.length > 3) {
          error(
            `Tuples with ${tupleTypes.length} elements are not supported; Elm only has 2- and 3-element tuples (consider a record instead)`
          );
        }
        return elm`( ${join(
          tupleTypes.map((el) => buildType(el, checker, node, false, inbound)),
          ", "
        )} )`;
      }

      // A string index signature (`Record<string, X>` or `{ [key: string]: X }`)
      // maps to an Elm `Dict String X`. We only treat it as a Dict when there are
      // no named properties, since Elm dictionaries are homogeneous.
      const stringIndexType = checker.getIndexTypeOfType(
        type,
        ts.IndexKind.String
      );
      if (stringIndexType && checker.getPropertiesOfType(type).length === 0) {
        return elm`Dict String (${buildType(
          stringIndexType,
          checker,
          node,
          false,
          inbound
        )})`;
      }

      if (type.aliasSymbol) {
        const args =
          type.aliasTypeArguments?.map((arg) =>
            buildType(arg, checker, node, false, inbound)
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
          filterOutLiterals,
          inbound
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
            filterOutLiterals,
            inbound
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
            t.typeArguments?.map((arg) =>
              buildType(arg, checker, node, false, inbound)
            ) ?? [];

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
            filterOutLiterals,
            inbound
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
      return buildObjectDefinition(
        type,
        checker,
        node,
        filterOutLiterals,
        inbound
      );

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
              )} (${buildType(t, checker, node, true, inbound)})`;
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
          return elm`Maybe (${buildType(
            subtype!,
            checker,
            node,
            false,
            inbound
          )})`;
        }
        error("Anonymous union types not supported");
      }

    case ts.TypeFlags.Intersection:
      return buildObjectDefinition(type, checker, node, false, inbound);

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
        `Advanced types not supported (${type.flags}): ${checker.typeToString(
          type
        )}`
      );
  }
};
