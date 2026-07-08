import { buildDecoder } from "./decoder";
import * as ts from "typescript";
import { query } from "@phenomnomnominal/tsquery";

describe.each([
  ["string", "Decode.string"],
  ["number", "Decode.float"],
  ["boolean", "Decode.bool"],
  [
    "{foo: string}",
    `Decode.succeed (\\foo -> { foo = foo })
      |> Decode.map2 (|>) (Decode.field "foo" (Decode.string))`,
  ],
  ["number[]", "Decode.list (Decode.float)"],
  [
    "{foo: number[]}[]",
    `Decode.list (Decode.succeed (\\foo -> { foo = foo })
      |> Decode.map2 (|>) (Decode.field "foo" (Decode.list (Decode.float))))`,
  ],
  [
    "{if: string}",
    `Decode.succeed (\\if_ -> { if_ = if_ })
      |> Decode.map2 (|>) (Decode.field "if" (Decode.string))`,
  ],
  ["Record<string, number>", "Decode.dict (Decode.float)"],
  [
    "Record<string, { x: number }>",
    `Decode.dict (Decode.succeed (\\x -> { x = x })
      |> Decode.map2 (|>) (Decode.field "x" (Decode.float)))`,
  ],
  [
    "[string, number]",
    `Decode.map2 (\\t0 t1 -> ( t0, t1 )) (Decode.index 0 (Decode.string)) (Decode.index 1 (Decode.float))`,
  ],
  [
    "[string, number, boolean]",
    `Decode.map3 (\\t0 t1 t2 -> ( t0, t1, t2 )) (Decode.index 0 (Decode.string)) (Decode.index 1 (Decode.float)) (Decode.index 2 (Decode.bool))`,
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

      expect(buildDecoder(type, checker, new Map())).toEqual(elmType);
    });
    expect.assertions(1);
  });
});

describe.each([
  [
    "type Foo = {foo: string}",
    "Foo",
    `Decode.succeed (\\foo -> { foo = foo })
      |> Decode.map2 (|>) (Decode.field "foo" (Decode.string))`,
  ],
  [
    "type Foo = {foo?: string}",
    "Foo",
    `Decode.succeed (\\foo -> { foo = foo })
      |> Decode.map2 (|>) (Decode.field "foo" (Decode.nullable (Decode.string)))`,
  ],
  [
    "type Foo<P> = {foo: P}",
    "Foo<number>",
    `Decode.succeed (\\foo -> { foo = foo })
      |> Decode.map2 (|>) (Decode.field "foo" (Decode.float))`,
  ],
  [
    "interface Foo {foo: string}",
    "Foo",
    `Decode.succeed (\\foo -> { foo = foo })
      |> Decode.map2 (|>) (Decode.field "foo" (Decode.string))`,
  ],
  [
    "interface foo<P> {foo: P}",
    "foo<number>",
    `Decode.succeed (\\foo -> { foo = foo })
      |> Decode.map2 (|>) (Decode.field "foo" (Decode.float))`,
  ],
  [
    "interface foo<P> {foo: P}",
    "foo<number>[]",
    `Decode.list (Decode.succeed (\\foo -> { foo = foo })
      |> Decode.map2 (|>) (Decode.field "foo" (Decode.float)))`,
  ],
  [
    `type Foo = "bar" | "baz"`,
    "Foo",
    `Decode.oneOf [Decode.map (always Bar)  (Decode.string |> Decode.andThen (\\str -> if str == \"bar\" then Decode.succeed str else Decode.fail \"Expected bar\")), Decode.map (always Baz)  (Decode.string |> Decode.andThen (\\str -> if str == \"baz\" then Decode.succeed str else Decode.fail \"Expected baz\"))]`,
  ],
  [
    `type Foo = "bar" | { tag: "baz", value: number }`,
    "Foo",
    `Decode.oneOf [Decode.map (always Bar)  (Decode.string |> Decode.andThen (\\str -> if str == "bar" then Decode.succeed str else Decode.fail "Expected bar")), Decode.map Baz (Decode.succeed (\\_ value -> { value = value })
      |> Decode.map2 (|>) (Decode.field "tag" (Decode.string |> Decode.andThen (\\str -> if str == "baz" then Decode.succeed str else Decode.fail "Expected baz")))
      |> Decode.map2 (|>) (Decode.field "value" (Decode.float)))]`,
  ],
  [
    `type Foo = { tag: 'foo', value: number } & { name : string }`,
    "Foo",
    `Decode.succeed (\\tag value name -> { tag = tag, value = value, name = name })
      |> Decode.map2 (|>) (Decode.field "tag" (Decode.string |> Decode.andThen (\\str -> if str == "foo" then Decode.succeed str else Decode.fail "Expected foo")))
      |> Decode.map2 (|>) (Decode.field "value" (Decode.float))
      |> Decode.map2 (|>) (Decode.field "name" (Decode.string))`,
  ],
  [
    `enum Foo { Red = "red", Green = "green" }`,
    "Foo",
    `Decode.string |> Decode.andThen (\\raw -> if raw == "red" then Decode.succeed Red else if raw == "green" then Decode.succeed Green else Decode.fail "Unexpected Foo")`,
  ],
  [
    `enum Foo { Red, Green, Blue }`,
    "Foo",
    `Decode.int |> Decode.andThen (\\raw -> if raw == 0 then Decode.succeed Red else if raw == 1 then Decode.succeed Green else if raw == 2 then Decode.succeed Blue else Decode.fail "Unexpected Foo")`,
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
      const elmType = buildDecoder(type, checker, new Map());
      expect(elmType).toEqual(elmTypeRef);
    });
    expect.assertions(1);
  });
});
