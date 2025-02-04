import { query, includes } from "@phenomnomnominal/tsquery";

import * as ts from "typescript";
import { buildEncoder } from "./elm/encoder";
import { buildType, type Type as ElmType } from "./elm/type";
import { buildDecoder } from "./elm/decoder";
import { toValueCase, toTypeCase, buildScope } from "./elm/utils";
import fs from "node:fs";
import path from "node:path";
import { typeDef } from "cmd-ts/dist/cjs/type";
import { handler, TransformError } from "./error";

type HtmlContent =
  | "none"
  | "single"
  | "list"
  | {
      [key: string]: {
        mode: "single" | "list";
        tag: string;
      };
    };

function extractEventsFromTypeVar(
  key: string,
  checker: ts.TypeChecker,
  arg: ts.Type
): Attr[] {
  const prop = checker.getPropertyOfType(arg, key);
  if (!prop) {
    return [];
  }
  return checker
    .getPropertiesOfType(checker.getTypeOfSymbol(prop))
    .map((prop) => {
      const type = checker.getTypeOfSymbolAtLocation(
        prop,
        prop.valueDeclaration!
      );
      return {
        name: prop.getName(),
        comment: ts.displayPartsToString(prop.getDocumentationComment(checker)),
        type,
        elmType: buildType(type, checker, prop.getDeclarations()![0]),
      };
    });
}

export const transform = (
  inputFiles: string[],
  program: ts.Program
): Map<string, string> => {
  const checker = program.getTypeChecker();
  const outputInfos = inputFiles
    .flatMap((fileName) => {
      const ast = program.getSourceFile(fileName);
      const classDecls = query(
        ast,
        "ClassDeclaration:has(Decorator[expression.expression.text='component'])"
      );
      if (classDecls.length === 0) {
        return null;
      }
      return classDecls.map((classDecl) => {
        if (ts.isClassDeclaration(classDecl) && classDecl.name) {
          let symbol = checker.getSymbolAtLocation(classDecl.name);
          if (!symbol) {
            return null;
          }
          const classType = checker.getTypeAtLocation(classDecl);

          if (classType.isClassOrInterface()) {
            const [baseType, ..._rst] = checker.getBaseTypes(classType);
            if (!baseType) {
              return null;
            }
            if (
              baseType.flags == ts.TypeFlags.Object &&
              (baseType as ts.ObjectType).objectFlags ==
                ts.ObjectFlags.Reference
            ) {
              const [arg, ...rst_] = checker.getTypeArguments(
                baseType as ts.TypeReference
              );
              var events = {
                required: extractEventsFromTypeVar(
                  "requiredEvents",
                  checker,
                  arg
                ),
                optional: extractEventsFromTypeVar(
                  "optionalEvents",
                  checker,
                  arg
                ),
              };
              var htmlContent: HtmlContent = "none";
              const htmlContentsProp = checker.getPropertyOfType(
                arg,
                "htmlContent"
              );
              if (htmlContentsProp != null) {
                const t = checker.getTypeOfSymbol(htmlContentsProp);
                if (t.isStringLiteral()) {
                  if (
                    t.value == "none" ||
                    t.value == "single" ||
                    t.value == "list"
                  ) {
                    htmlContent = t.value;
                  } else {
                    throw new Error(
                      `${t.value} is an unsupported htmlContent value`
                    );
                  }
                } else if (t.flags == ts.TypeFlags.Object) {
                  htmlContent = Object.fromEntries(
                    checker.getPropertiesOfType(t).map((prop) => {
                      let mode: "single" | "list";
                      let tag: string;

                      const value = checker.getTypeAtLocation(
                        prop.valueDeclaration
                      );
                      if (value.flags == ts.TypeFlags.Object) {
                        const modeProp = checker.getPropertyOfType(
                          value,
                          "mode"
                        );
                        if (modeProp) {
                          const modeType = checker.getTypeOfSymbolAtLocation(
                            modeProp,
                            prop.valueDeclaration!
                          );
                          if (
                            modeType.isStringLiteral() &&
                            (modeType.value == "single" ||
                              modeType.value == "list")
                          ) {
                            mode = modeType.value as "single" | "list";
                          } else {
                            mode = "single";
                          }
                        } else {
                          mode = "single";
                        }
                        const tagProp = checker.getPropertyOfType(value, "tag");
                        if (tagProp) {
                          const tagType = checker.getTypeOfSymbolAtLocation(
                            tagProp,
                            prop.valueDeclaration!
                          );
                          tag = tagType.isStringLiteral()
                            ? tagType.value
                            : "div";
                        } else {
                          tag = "div";
                        }

                        return [
                          prop.getName(),
                          {
                            mode,
                            tag,
                          },
                        ];
                      } else {
                        throw new Error("Unsupported htmlContent value");
                      }
                    })
                  );
                }
              }
              var extraAttributes = true;
              const extraAttributesProp = checker.getPropertyOfType(
                arg,
                "extraAttributes"
              );
              if (extraAttributesProp != null) {
                const t = checker.getTypeOfSymbol(extraAttributesProp);
                if (checker.typeToString(t) == "false") {
                  extraAttributes = false;
                }
              }

              var viewFnName = "view";
              const viewFnNameProp = checker.getPropertyOfType(
                arg,
                "viewFnName"
              );
              if (viewFnNameProp != null) {
                const t = checker.getTypeOfSymbol(viewFnNameProp);
                if (t.isStringLiteral()) {
                  viewFnName = t.value;
                }
              }
            }
          }

          const elementNameNode = query(
            classDecl,
            "Decorator[expression.expression.text='component'] CallExpression > StringLiteral:first-child"
          );
          const tagName =
            elementNameNode.length > 0 && ts.isStringLiteral(elementNameNode[0])
              ? elementNameNode[0].text
              : null;

          if (!tagName) throw new Error("No tag name found");

          const propertyNodes = query(
            classDecl,
            "PropertyDeclaration:has(Decorator[expression.text='required'],Decorator[expression.text='optional'],Decorator[expression.text='lazy']),SetAccessor:has(Decorator[expression.text='required'],Decorator[expression.text='optional'],Decorator[expression.text='lazy'])"
          );

          const optionalAttributes: Attr[] = [];
          const requiredAttributes: Attr[] = [];
          const lazyAttributes: Attr[] = [];
          propertyNodes.forEach((propertyNode) => {
            if (
              (ts.isPropertyDeclaration(propertyNode) ||
                ts.isSetAccessor(propertyNode)) &&
              propertyNode.name
            ) {
              const requiredDecorator = query(
                propertyNode,
                "Decorator[expression.text='required']"
              )[0];
              const optionalDecorator = query(
                propertyNode,
                "Decorator[expression.text='optional']"
              )[0];
              const lazyDecorator = query(
                propertyNode,
                "Decorator[expression.text='lazy']"
              )[0];
              let decorator;

              const symbol = checker.getSymbolAtLocation(propertyNode.name);
              if (!symbol) {
                return;
              }
              const comment = ts.displayPartsToString(
                symbol.getDocumentationComment(checker)
              );
              const type = checker.getTypeOfSymbolAtLocation(
                symbol,
                symbol.valueDeclaration!
              );

              const targetNode = query(
                propertyNode,
                "TypeReference,SemicolonToken"
              )[0];

              if (requiredDecorator) {
                requiredAttributes.push({
                  name: propertyNode.name.getText(),
                  comment,
                  type,
                  elmType: buildType(type, checker, targetNode),
                });
              } else if (lazyDecorator) {
                lazyAttributes.push({
                  name: propertyNode.name.getText(),
                  comment,
                  type,
                  elmType: buildType(type, checker, targetNode),
                });
              } else if (optionalDecorator) {
                optionalAttributes.push({
                  name: propertyNode.name.getText(),
                  comment,
                  type,
                  elmType: buildType(type, checker, targetNode),
                });
              }
            }
          });

          const getTypeDefs = (attrs: Attr[]) => {
            return attrs.flatMap((attr) => [...attr.elmType.definitions]);
          };

          return {
            viewFnName,
            properties: {
              optional: optionalAttributes,
              required: requiredAttributes,
              lazy: lazyAttributes,
            },
            events,
            moduleName: symbol.getName(),
            moduleComments: ts.displayPartsToString(
              symbol.getDocumentationComment(checker)
            ),
            tagName,
            checker,
            htmlContent,
            attributesArg:
              optionalAttributes.length > 0 ||
              events.optional.length > 0 ||
              extraAttributes,
            typeDefs: new Map([
              ...getTypeDefs(optionalAttributes),
              ...getTypeDefs(requiredAttributes),
              ...getTypeDefs(lazyAttributes),
              ...getTypeDefs(events.required),
              ...getTypeDefs(events.optional),
            ]),
          };
        }
      });
    })
    .filter((x) => x != null) as OutputInfo[];

  const output = new Map<string, string>();
  outputInfos.forEach((info) => {
    output.set(info.moduleName + ".elm", formatElmFile(info));
  });
  return output;
};

export const main = ({
  outputDir,
  inputFiles,
}: {
  inputFiles: string[];
  outputDir: string;
}) => {
  try {
    const program = ts.createProgram(inputFiles, { strictNullChecks: true });
    const output = transform(inputFiles, program);
    [...output.entries()].forEach(([fileName, content]) => {
      fs.writeFileSync(path.join(outputDir, fileName), content);
    });
  } catch (e) {
    if (e instanceof TransformError) {
      handler(e);
    } else {
      throw e;
    }
  }
};

type Attr = { name: string; comment: string; type: ts.Type; elmType: ElmType };

type AttrList = { optional: Attr[]; required: Attr[] };

type OutputInfo = {
  viewFnName: string;
  properties: AttrList & { lazy: Attr[] };
  events: AttrList;
  moduleName: string;
  moduleComments: string;
  tagName: string;
  checker: ts.TypeChecker;
  htmlContent: HtmlContent;
  attributesArg: boolean;
  typeDefs: Map<string, string>;
};

const htmlContentToTypeSig = (htmlContent: HtmlContent): string => {
  switch (htmlContent) {
    case "none":
      return "";
    case "single":
      return "Html msg -> ";
    case "list":
      return "List (Html msg) ->";
    default:
      return "";
  }
};

const htmlContentToValue = (htmlContent: HtmlContent): string => {
  switch (htmlContent) {
    case "none":
      return "[]";
    case "single":
      return "[ child ]";
    case "list":
      return "children";
    default:
      return `[ ${Object.entries(htmlContent)
        .map(([name, { tag, mode }]) => {
          return `Html.${tag} [ Html.Attributes.attribute "slot" "${name}" ] ${
            mode == "list"
              ? `req.${toValueCase(name)}`
              : `[ req.${toValueCase(name)} ]`
          }`;
        })
        .join("\n     ,")}\n    ]`;
  }
};

type RequiredArgs = Array<
  | (Attr & { kind: "property" | "lazy" | "event" })
  | {
      name: string;
      kind: "htmlContent";
      tag: string;
      mode: "single" | "list";
    }
>;

const getRequiredArgs = (info: OutputInfo): RequiredArgs => {
  const enrichWithKind =
    <A>(kind: A) =>
    <T>(obj: T): T & { kind: A } => ({ ...obj, kind });
  type requiredKind = "property" | "lazy" | "event" | "htmlContent";
  let requiredArgs: Array<
    | (Attr & { kind: "property" | "lazy" | "event" })
    | {
        name: string;
        kind: "htmlContent";
        tag: string;
        mode: "single" | "list";
      }
  > = info.properties.required
    .map(enrichWithKind("property" as "property" | "lazy" | "event"))
    .concat(
      info.properties.lazy.map(
        enrichWithKind("lazy" as "property" | "lazy" | "event")
      )
    )
    .concat(
      info.events.required.map(
        enrichWithKind("event" as "property" | "lazy" | "event")
      )
    );

  if (typeof info.htmlContent == "object") {
    requiredArgs = requiredArgs.concat(
      Object.entries(info.htmlContent).map(([key, value]) => ({
        name: key,
        kind: "htmlContent",
        ...value,
      }))
    );
  }
  return requiredArgs;
};

const formatElmFile = (info: OutputInfo) => {
  const exposing = [info.viewFnName];

  exposing.push(...info.properties.optional.map((oa) => toValueCase(oa.name)));
  exposing.push(
    ...info.events.optional.map((oa) => toValueCase(`on ${oa.name}`))
  );

  exposing.push(...info.typeDefs.keys());
  const requiredArgs = getRequiredArgs(info);

  // this constructs a list of all the names in the module scope and/or the name of one of the main arguments
  const scopeNames = [
    ...info.properties.optional.map((oa) => toValueCase(oa.name)),
    ...info.events.optional.map((oa) => toValueCase(`on ${oa.name}`)),
    info.viewFnName,
    ...(info.attributesArg ? ["attrs"] : []),
    ...(requiredArgs.length > 0 ? ["req"] : []),
    ...(info.htmlContent == "list" ? ["children"] : ["child"]),
    ...info.properties.lazy.map((la) => toValueCase(la.name) + "ValueSetter"),
    "tagger",
  ];
  const scope = buildScope(scopeNames);

  return `module ${info.moduleName} exposing (${exposing.join(", ")})

{-| ${info.moduleComments}

@docs ${exposing.join(", ")}
-} 

import Html exposing (Html, Attribute)
import Html.Attributes
import Html.Events
import Json.Encode as Encode
import Json.Decode as Decode
${info.properties.lazy.length > 0 ? "import Html.Lazy" : ""}

${Array.from(info.typeDefs.values()).join("\n\n")}

${info.properties.optional
  .map(
    (oa) =>
      `{-| ${oa.comment} -}
${toValueCase(oa.name)} : ${oa.elmType.expression} -> Attribute msg
${toValueCase(oa.name)} val = 
    Html.Attributes.property "${oa.name}" (${buildEncoder(
        oa.type,
        "val",
        info.checker,
        scope
      )})
`
  )
  .join("\n")}

${info.events.optional
  .map(
    (oa) =>
      `{-| ${oa.comment} -}
${toValueCase(`on ${oa.name}`)} : (${
        oa.elmType.expression
      } -> msg) -> Attribute msg
${toValueCase(`on ${oa.name}`)} tagger = 
      Html.Events.on "${oa.name}" (Decode.map tagger (${buildDecoder(
        oa.type,
        info.checker,
        scope
      )}))
  `
  )
  .join("\n")}

{-| -}
${info.viewFnName} : ${info.attributesArg ? "List (Attribute msg) -> " : ""}${
    requiredArgs.length > 0
      ? `{${requiredArgs
          .map((ra) => {
            switch (ra.kind) {
              case "property":
                return `${toValueCase(ra.name)} : ${ra.elmType.expression}`;
              case "lazy":
                return `${toValueCase(ra.name)} : ${ra.elmType.expression}`;
              case "event":
                return `${toValueCase(`on ${ra.name}`)} : ${
                  ra.elmType.expression
                } -> msg`;
              case "htmlContent":
                return `${toValueCase(ra.name)} : ${
                  ra.mode == "list" ? "List" : ""
                } (Html msg)`;
            }
          })
          .join(", ")} } -> `
      : ""
  } ${htmlContentToTypeSig(info.htmlContent)} Html msg
${info.viewFnName} ${info.attributesArg ? "attrs " : ""}${
    requiredArgs.length > 0 ? "req " : ""
  }${
    info.htmlContent == "list"
      ? " children "
      : info.htmlContent == "single"
      ? " child "
      : ""
  }=
    Html.node "${info.tagName}" (${info.properties.required
    .map(
      (ra) =>
        `Html.Attributes.property "${ra.name}" (${buildEncoder(
          ra.type,
          `req.${toValueCase(ra.name)}`,
          info.checker,
          scope
        )})`
    )
    .concat(
      info.events.required.map(
        (re) =>
          `Html.Events.on "${re.name}" (Decode.map req.${toValueCase(
            `on ${re.name}`
          )} (${buildDecoder(re.type, info.checker, scope)}))
      `
      )
    )
    .join(" :: ")} ${
    info.properties.required.length > 0 || info.events.required.length > 0
      ? " :: "
      : ""
  }${info.attributesArg ? " attrs " : " [] "})  (${info.properties.lazy
    .map(
      (la) =>
        `(Html.Lazy.lazy ${toValueCase(la.name)}ValueSetter req.${toValueCase(
          la.name
        )})`
    )
    .join(" :: ")} ${
    info.properties.lazy.length > 0 ? "::" : ""
  } ${htmlContentToValue(info.htmlContent)})

${info.properties.lazy
  .map(
    (la) =>
      `${toValueCase(la.name)}ValueSetter : ${la.elmType.expression} -> Html msg
${toValueCase(la.name)}ValueSetter val = 
  Html.node "ewc-value-setter" [ Html.Attributes.property "key" (Encode.string "${
    la.name
  }"), Html.Attributes.property "value" (${buildEncoder(
        la.type,
        "val",
        info.checker,
        scope
      )})] []
`
  )
  .join("\n")}
`;
};
