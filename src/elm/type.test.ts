import { buildType } from "./type";
import * as ts from "typescript";
import { query } from "@phenomnomnominal/tsquery";

describe.each([
  ["string", "String"],
  ["number", "Float"],
  ["boolean", "Bool"],
  ["{foo: string}", "{ foo : String }"],
  ["number[]", "List (Float)"],
  ["{foo: number[]}[]", "List ({ foo : List (Float) })"],
  ["{if: string}", "{ if_ : String }"],
])("simple types %s converts to %s", (tsType, elmType) => {
  test("converts types correctly", () => {
    const source = `
    let target : ${tsType};
    `;
    const host = ts.createCompilerHost({});
    const orig = host.getSourceFile;
    host.getSourceFile = (fileName, ...args) => {
      if (fileName == "input.ts") {
        return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest);
      }
      return orig(fileName, ...args);
    };

    const program = ts.createProgram(["input.ts"], {}, host);
    const checker = program.getTypeChecker();
    const ast = program.getSourceFile("input.ts")!;
    query(ast, "VariableDeclaration").forEach((stmt) => {
      const type = checker.getTypeAtLocation(
        (stmt as ts.VariableDeclaration).type!
      );

      expect(buildType(type, checker, stmt).expression).toEqual(elmType);
    });
    expect.assertions(1);
  });
});

describe.each([
  [
    "type foo = {foo: string}",
    "foo",
    new Map([["Foo", "type alias Foo = { foo : String }"]]),
    "Foo",
  ],
  [
    `/**
  * Some comment
  */
type Foo = {foo: string}`,
    "Foo",
    new Map([
      [
        "Foo",
        `{-| Some comment -}
type alias Foo = { foo : String }`,
      ],
    ]),
    "Foo",
  ],
  [
    "type Foo = {foo?: string}",
    "Foo",
    new Map([["Foo", "type alias Foo = { foo : Maybe String }"]]),
    "Foo",
  ],
  [
    "type Foo<P> = {foo: P}",
    "Foo<number>",
    new Map([["Foo", "type alias Foo p = { foo : p }"]]),
    "Foo Float",
  ],
  [
    "interface Foo {foo: string}",
    "Foo",
    new Map([["Foo", "type alias Foo = { foo : String }"]]),
    "Foo",
  ],
  [
    "/**\n * Docs\n */\ninterface Foo {foo: string}",
    "Foo",
    new Map([["Foo", "{-| Docs -}\ntype alias Foo = { foo : String }"]]),
    "Foo",
  ],
  [
    "interface foo<P> {foo: P}",
    "foo<number>",
    new Map([["Foo", "type alias Foo p = { foo : p }"]]),
    "Foo Float",
  ],
  [
    "interface foo<P> {foo: P}",
    "foo<number>[]",
    new Map([["Foo", "type alias Foo p = { foo : p }"]]),
    "List (Foo Float)",
  ],
  [
    `type foo = "bar" | "baz"`,
    "foo",
    new Map([["Foo(..)", "type Foo = Bar | Baz"]]),
    "Foo",
  ],
  [
    `type Foo = "bar" | { tag: "baz", value: number }`,
    "Foo",
    new Map([["Foo(..)", "type Foo = Bar | Baz ({ value : Float })"]]),
    "Foo",
  ],
  [
    `type Foo = { tag: 'foo', value: number } & { name : string }`,
    "Foo",
    new Map(),
    "{ tag : String, value : Float, name : String }",
  ],
])("%s type %s converts", (tsTypeDef, tsTypeRef, elmTypeDef, elmTypeRef) => {
  test("converts types correctly", () => {
    const source = `
    ${tsTypeDef};

    let target : ${tsTypeRef};
    `;
    const host = ts.createCompilerHost({});
    const orig = host.getSourceFile;
    host.getSourceFile = (fileName, ...args) => {
      if (fileName == "input.ts") {
        return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest);
      }
      return orig(fileName, ...args);
    };

    const program = ts.createProgram(["input.ts"], { strict: true }, host);
    const checker = program.getTypeChecker();
    const ast = program.getSourceFile("input.ts")!;
    query(ast, "VariableDeclaration").forEach((stmt) => {
      const type = checker.getTypeAtLocation(
        (stmt as ts.VariableDeclaration).type!
      );
      const elmType = buildType(type, checker, stmt);
      expect(elmType.expression).toEqual(elmTypeRef);
      expect(elmType.definitions).toEqual(elmTypeDef);
    });
    expect.assertions(2);
  });
});
