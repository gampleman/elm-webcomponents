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
  ["Record<string, number>", "Dict String (Float)"],
  ["{ [key: string]: string }", "Dict String (String)"],
  ["Record<string, { x: number }>", "Dict String ({ x : Float })"],
  ["[string, number]", "( String, Float )"],
  ["[string, number, boolean]", "( String, Float, Bool )"],
  ["[string, number[]]", "( String, List (Float) )"],
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
    new Map([["Foo", "type alias Foo = { foo : Maybe (String) }"]]),
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
  [
    `enum Foo { Red = "red", Green = "green" }`,
    "Foo",
    new Map([["Foo(..)", "type Foo = Red | Green"]]),
    "Foo",
  ],
  [
    `enum Foo { Red, Green, Blue }`,
    "Foo",
    new Map([["Foo(..)", "type Foo = Red | Green | Blue"]]),
    "Foo",
  ],
  [
    `type Int = number & { readonly __elmInt__?: never }`,
    "Int",
    new Map(),
    "Int",
  ],
  [
    `type Int = number & { readonly __elmInt__?: never };
     type Point = { x: Int; y: number }`,
    "Point",
    new Map([["Point", "type alias Point = { x : Int, y : Float }"]]),
    "Point",
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

// Template literals need the *reference* node (the `Foo` in `let x: Foo`) to
// recover the alias name, since TypeScript resolves the alias away.
describe.each([
  [
    "type Foo = `item-${string}`",
    "Foo",
    "Foo",
    'type Foo\n    = Foo String',
  ],
  [
    "type Foo = `${number}px`",
    "Foo",
    "Foo",
    "type Foo\n    = Foo String",
  ],
])("template literal %s", (tsTypeDef, tsTypeRef, elmTypeRef, elmTypeDef) => {
  test("converts to an opaque newtype", () => {
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
      const node = (stmt as ts.VariableDeclaration).type!;
      const type = checker.getTypeAtLocation(node);
      const elmType = buildType(type, checker, node);
      expect(elmType.expression).toEqual(elmTypeRef);
      // the opaque type definition is emitted; a smart constructor accompanies it
      expect(elmType.definitions.get("Foo")).toEqual(elmTypeDef);
      expect(elmType.definitions.has("foo")).toBe(true);

      // Inbound (event payload): the opaque newtype would be unusable since its
      // constructor is not exposed, so it degrades to a plain String.
      const inbound = buildType(type, checker, node, false, true);
      expect(inbound.expression).toEqual("String");
      expect(inbound.definitions.size).toEqual(0);
    });
    expect.assertions(5);
  });
});

// A template literal nested inside a record must still recover its name from
// the property's type node (the alias is resolved away on the type itself).
describe("nested template literal", () => {
  test("inside a record still becomes an opaque newtype", () => {
    const source = `
    type Size = \`\${number}px\`;
    type Rec = { size: Size };

    let target : Rec;
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
      const node = (stmt as ts.VariableDeclaration).type!;
      const type = checker.getTypeAtLocation(node);
      const elmType = buildType(type, checker, node);
      // the record references the opaque Size, and its definitions are carried up
      expect(elmType.definitions.get("Size")).toEqual("type Size\n    = Size String");
      expect(elmType.definitions.has("size")).toBe(true);
    });
    expect.assertions(2);
  });
});
