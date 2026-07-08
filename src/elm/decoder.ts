import * as ts from "typescript";
import { toValueCase, toTypeCase, introduce, enumInfo, tupleElements } from "./utils";
import { TransformError, nodeFromType } from "../error";

const todo = (name: string) => {
  console.warn(`${name} is not implemented for decoders`);
  return `Debug.todo "${name} is not implemented for decoders"`;
};

export const buildDecoder = (
  type: ts.Type,
  checker: ts.TypeChecker,
  scope: Map<string, number>,
  omitLiterals = false
): string => {
  let variable: string, newScope: Map<string, number>;
  //reusable variable declarations
  let properties: ts.Symbol[];
  let propNames: string[];

  const error = (message: string): never => {
    throw new TransformError(nodeFromType(type), message);
  };

  // Enums (a union of EnumLiteral members) decode the underlying primitive and
  // then map each serialized value to its Elm constructor, failing on anything
  // unexpected. Emitted on a single line so it parses at any nesting depth.
  const enumType = enumInfo(type, checker);
  if (enumType) {
    [variable, newScope] = introduce("raw", scope);
    const primitive = enumType.isString ? "Decode.string" : "Decode.int";
    const literal = (value: string | number) =>
      enumType.isString ? `"${value}"` : `${value}`;
    const branches = enumType.members
      .map(
        (member) =>
          `if ${variable} == ${literal(member.value)} then Decode.succeed ${
            member.constructor
          } else `
      )
      .join("");
    return `${primitive} |> Decode.andThen (\\${variable} -> ${branches}Decode.fail "Unexpected ${enumType.name}")`;
  }

  switch (type.flags) {
    case ts.TypeFlags.Any:
      error("Any type is not supported: its shape is unknown so no decoder can be generated");
    case ts.TypeFlags.Unknown:
      error(
        "Unknown type is not supported: its shape is unknown so no decoder can be generated"
      );
    case ts.TypeFlags.String:
      return `Decode.string`;
    case ts.TypeFlags.Number:
      return `Decode.float`;
    case ts.TypeFlags.Boolean:
    case ts.TypeFlags.Boolean | ts.TypeFlags.Union:
      return `Decode.bool`;
    // Enums are handled by the enumInfo guard above.

    case ts.TypeFlags.BigInt:
    case ts.TypeFlags.BigIntLiteral:
      error("BigInt type is not supported: Elm has no BigInt equivalent");
    case ts.TypeFlags.StringLiteral:
      [variable, newScope] = introduce("str", scope);
      let t = type as ts.StringLiteralType;
      return `Decode.string |> Decode.andThen (\\${variable} -> if ${variable} == "${t.value}" then Decode.succeed ${variable} else Decode.fail "Expected ${t.value}")`;

    case ts.TypeFlags.NumberLiteral:
      // TODO: Implement NumberLiteral
      return `Decode.float`;

    case ts.TypeFlags.BooleanLiteral:
      // TODO: Implement BooleanLiteral
      return `Decode.bool`;

    case ts.TypeFlags.ESSymbol:
    case ts.TypeFlags.UniqueESSymbol:
      error("Symbol type is not supported: symbols cannot be represented in JSON");

    case ts.TypeFlags.Void:
    case ts.TypeFlags.Undefined:
    case ts.TypeFlags.Null:
    case ts.TypeFlags.Never:
      error("Void/undefined/null/never types are not supported as a decoder target");

    case ts.TypeFlags.TypeParameter:
      return todo("TypeParameter");
    case ts.TypeFlags.Object:
      if (checker.isArrayType(type)) {
        return `Decode.list (${buildDecoder(
          checker.getTypeArguments(type as ts.TypeReference)[0],
          checker,
          scope
        )})`;
      }

      // Tuples decode positionally from a JSON array via Decode.index.
      const tupleTypes = tupleElements(type, checker);
      if (tupleTypes) {
        if (tupleTypes.length < 2 || tupleTypes.length > 3) {
          error(
            `Tuples with ${tupleTypes.length} elements are not supported; Elm only has 2- and 3-element tuples`
          );
        }
        let tupleScope = scope;
        const names = tupleTypes.map((_, i) => {
          let name;
          [name, tupleScope] = introduce(`t${i}`, tupleScope);
          return name;
        });
        const fields = tupleTypes
          .map(
            (el, i) =>
              `(Decode.index ${i} (${buildDecoder(el, checker, tupleScope)}))`
          )
          .join(" ");
        return `Decode.map${tupleTypes.length} (\\${names.join(
          " "
        )} -> ( ${names.join(", ")} )) ${fields}`;
      }

      const stringIndexType = checker.getIndexTypeOfType(
        type,
        ts.IndexKind.String
      );
      if (stringIndexType && checker.getPropertiesOfType(type).length === 0) {
        return `Decode.dict (${buildDecoder(stringIndexType, checker, scope)})`;
      }
      properties = checker.getPropertiesOfType(type);
      let propies;
      [propies, newScope] = properties.reduce<
        [[string, string][], Map<string, number>]
      >(
        ([vals, scope], prop) => {
          if (
            !omitLiterals ||
            !checker.getTypeOfSymbol(prop).isStringLiteral()
          ) {
            let name = toValueCase(prop.getName());
            let [newName, newScope] = introduce(name, scope);
            return [[...vals, [name, newName]], newScope];
          } else {
            return [[...vals, [toValueCase(prop.getName()), "_"]], scope];
          }
        },
        [[], scope]
      );

      return `Decode.succeed (\\${propies
        .map((p) => p[1])
        .join(" ")} -> { ${propies
        .filter((p) => p[1] !== "_")
        .map((p) => `${p[0]} = ${p[1]}`)
        .join(", ")} })
      ${properties
        .map(
          (prop) =>
            `|> Decode.map2 (|>) (Decode.field "${prop.getName()}" (${buildDecoder(
              checker.getTypeOfSymbol(prop),
              checker,
              newScope
            )}))`
        )
        .join("\n      ")}`;

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

        return `Decode.nullable (${buildDecoder(subtype, checker, scope)})`;
      }
      return `Decode.oneOf [${refType.types
        .map((t) => {
          if (t.isStringLiteral()) {
            return `Decode.map (always ${toTypeCase(t.value)})  (${buildDecoder(
              t,
              checker,
              scope
            )})`;
          } else {
            let prop = t
              .getProperties()
              .map((sym) =>
                checker.getTypeOfSymbolAtLocation(sym, sym.valueDeclaration)
              )
              .find((ts) => ts.isStringLiteral())?.value;

            return `Decode.map ${toTypeCase(prop)} (${buildDecoder(
              t,
              checker,
              scope,
              true
            )})`;
          }
        })
        .join(", ")}]`;

    case ts.TypeFlags.Intersection:
      properties = checker.getPropertiesOfType(type);
      propNames = properties.map((prop) => toValueCase(prop.getName()));

      return `Decode.succeed (\\${propNames.join(" ")} -> { ${propNames
        .map((prop) => `${prop} = ${prop}`)
        .join(", ")} })
      ${properties
        .map(
          (prop) =>
            `|> Decode.map2 (|>) (Decode.field "${prop.getName()}" (${buildDecoder(
              checker.getTypeOfSymbol(prop),
              checker,
              scope
            )}))`
        )
        .join("\n      ")}`;

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
