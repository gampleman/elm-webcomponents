import { query, includes } from "@phenomnomnominal/tsquery";

import * as ts from "typescript";
import { buildEncoder } from "./elm/encoder";
import { buildType } from "./elm/type";
import { buildDecoder } from "./elm/decoder";

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
    .getPropertiesOfType(
      checker.getTypeOfSymbol(checker.getPropertyOfType(arg, key))
    )
    .map((prop) => {
      return {
        name: prop.getName(),
        comment: ts.displayPartsToString(prop.getDocumentationComment(checker)),
        type: checker.getTypeOfSymbolAtLocation(prop, prop.valueDeclaration!),
      };
    });
}

export const main = (files: string[]) => {
  const program = ts.createProgram(files, {});
  const checker = program.getTypeChecker();
  const outputInfos = files.flatMap((fileName) => {
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
            (baseType as ts.ObjectType).objectFlags == ts.ObjectFlags.Reference
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
          "PropertyDeclaration:has(Decorator[expression.expression.text='api']):has(AccessorKeyword)"
        );

        const optionalAttributes: Attr[] = [];
        const requiredAttributes: Attr[] = [];
        propertyNodes.forEach((propertyNode) => {
          if (ts.isPropertyDeclaration(propertyNode) && propertyNode.name) {
            const decorator = query(
              propertyNode,
              "Decorator[expression.expression.text='api']"
            )[0];
            if (!decorator) {
              return;
            }
            const required = includes(
              decorator,
              "CallExpression PropertyAssignment:has(Identifier[text='required']) TrueKeyword"
            );

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

            if (!required) {
              optionalAttributes.push({
                name: propertyNode.name.getText(),
                comment,
                type,
              });
            } else {
              requiredAttributes.push({
                name: propertyNode.name.getText(),
                comment,
                type,
              });
            }
          }
        });
        console.log(optionalAttributes);
        return {
          viewFnName: "view",
          properties: {
            optional: optionalAttributes,
            required: requiredAttributes,
          },
          events,
          moduleName: symbol.getName(),
          moduleComments: ts.displayPartsToString(
            symbol.getDocumentationComment(checker)
          ),
          tagName,
          checker,
        };
      }
    });
  });
  console.log(outputInfos);

  outputInfos.forEach((info) => {
    console.log(formatElmFile(info));
  });
};

type Attr = { name: string; comment: string; type: ts.Type };

type AttrList = { optional: Attr[]; required: Attr[] };

type OutputInfo = {
  viewFnName: string;
  properties: AttrList;
  events: AttrList;
  moduleName: string;
  moduleComments: string;
  tagName: string;
  checker: ts.TypeChecker;
};

const formatElmFile = (info: OutputInfo) => {
  const exposing = [info.viewFnName];
  if (info.properties.optional.length > 0) {
    exposing.push(...info.properties.optional.map((oa) => oa.name));
  }
  return `module ${info.moduleName} exposing (${exposing.join(", ")})

{-| ${info.moduleComments}

@docs ${exposing.join(", ")}
-} 

import Html exposing (Html)
import Html.Attributes exposing (Attribute)
import Json.Encode as Encode

${info.properties.optional
  .map(
    (oa) =>
      `{-| ${oa.comment} -}
${oa.name} : ${buildType(oa.type, info.checker)} -> Attribute msg
${oa.name} val = 
    Html.Attributes.property "${oa.name}" (${buildEncoder(
        oa.type,
        "val",
        info.checker
      )})
`
  )
  .join("\n")}

${info.events.optional
  .map(
    (oa) =>
      `{-| ${oa.comment} -}
on${oa.name} : (${buildType(oa.type, info.checker)} -> msg) -> Attribute msg
on${oa.name} tagger = 
      Html.Events.on "${oa.name}" (Decode.map tagger (${buildDecoder(
        oa.type,
        info.checker
      )}))
  `
  )
  .join("\n")}

{-| -}
${info.viewFnName} : ${
    info.properties.optional.length > 0 ? "List (Attribute msg) ->" : ""
  } ${
    info.properties.required.length > 0
      ? `{${info.properties.required
          .map((ra) => `${ra.name} : ${buildType(ra.type, info.checker)}`)
          .join(", ")} } -> `
      : ""
  } Html msg
${info.viewFnName} ${info.properties.optional.length > 0 ? "attrs " : ""} ${
    info.properties.required.length > 0 ? "req " : ""
  } =
    Html.node "${info.tagName}" (${info.properties.required
    .map(
      (ra) =>
        `Html.Attributes.property "${ra.name}" (${buildEncoder(
          ra.type,
          `req.${ra.name}`,
          info.checker
        )})`
    )
    .join(" :: ")} :: attrs ) []
`;
};
