import { buildEncoder } from "./encoder";
import * as ts from "typescript";
import { query } from "@phenomnomnominal/tsquery";

describe.each([
  ["string", "Encode.string value"],
  ["number", "Encode.float value"],
  ["boolean", "Encode.bool value"],
  ["{foo: string}", `Encode.object [ ( "foo", Encode.string value.foo ) ]`],
  ["number[]", "Encode.list (\\el -> Encode.float el) value"],
  [
    "{foo: number[]}[]",
    `Encode.list (\\el -> Encode.object [ ( "foo", Encode.list (\\el1 -> Encode.float el1) el.foo ) ]) value`,
  ],
  ["{if: string}", `Encode.object [ ( "if", Encode.string value.if_ ) ]`],
  [
    "Record<string, number>",
    `Encode.dict identity (\\v -> Encode.float v) value`,
  ],
  [
    "Record<string, { x: number }>",
    `Encode.dict identity (\\v -> Encode.object [ ( "x", Encode.float v.x ) ]) value`,
  ],
  [
    "[string, number]",
    `(\\( t0, t1 ) -> Encode.list identity [ Encode.string t0, Encode.float t1 ]) value`,
  ],
  [
    "[string, number, boolean]",
    `(\\( t0, t1, t2 ) -> Encode.list identity [ Encode.string t0, Encode.float t1, Encode.bool t2 ]) value`,
  ],
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

      expect(buildEncoder(type, "value", checker, new Map())).toEqual(elmType);
    });
    expect.assertions(1);
  });
});

describe.each([
  [
    "type Foo = {foo: string}",
    "Foo",
    `Encode.object [ ( "foo", Encode.string value.foo ) ]`,
  ],
  [
    "type Foo = {foo?: string}",
    "Foo",
    `Encode.object [ ( "foo", case (value.foo) of
        Nothing -> Encode.null
        Just val -> Encode.string val ) ]`,
  ],
  [
    "type Foo<P> = {foo: P}",
    "Foo<number>",
    `Encode.object [ ( "foo", Encode.float value.foo ) ]`,
  ],
  [
    "interface Foo {foo: string}",
    "Foo",
    `Encode.object [ ( "foo", Encode.string value.foo ) ]`,
  ],
  [
    "interface foo<P> {foo: P}",
    "foo<number>",
    `Encode.object [ ( "foo", Encode.float value.foo ) ]`,
  ],
  [
    "interface foo<P> {foo: P}",
    "foo<number>[]",
    `Encode.list (\\el -> Encode.object [ ( "foo", Encode.float el.foo ) ]) value`,
  ],
  [
    `type Foo = "bar" | "baz"`,
    "Foo",
    `case (value) of
        Bar -> Encode.string "bar"
        Baz -> Encode.string "baz"`,
  ],
  [
    `type Foo = "bar" | { tag: "baz", value: number }`,
    "Foo",
    `case (value) of
        Bar -> Encode.string "bar"
        Baz baz -> Encode.object [ ( "tag", Encode.string "baz" ) , ( "value", Encode.float baz.value ) ]`,
  ],
  [
    `type Foo = { tag: 'foo', value: number } & { name : string }`,
    "Foo",
    `Encode.object [ ( "tag", Encode.string "foo" ) , ( "value", Encode.float value.value ) , ( "name", Encode.string value.name ) ]`,
  ],
  [
    `enum Foo { Red = "red", Green = "green" }`,
    "Foo",
    `case (value) of
        Red -> Encode.string "red"
        Green -> Encode.string "green"`,
  ],
  [
    `enum Foo { Red, Green, Blue }`,
    "Foo",
    `case (value) of
        Red -> Encode.int 0
        Green -> Encode.int 1
        Blue -> Encode.int 2`,
  ],
])("%s type %s converts", (tsTypeDef, tsTypeRef, elmTypeRef) => {
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
      const elmType = buildEncoder(type, "value", checker, new Map());
      expect(elmType).toEqual(elmTypeRef);
    });
    expect.assertions(1);
  });
});
