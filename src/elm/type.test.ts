import { buildType } from "./type";
import * as ts from "typescript";

describe.each([
  ["string", "String"],
  ["number", "Float"],
  ["boolean", "Bool"],
  ["{foo: string}", "{ foo : String }"],
  ["number[]", "List (Float)"],
  ["{foo: number[]}[]", "List ({ foo : List (Float) })"],
])("simple types %s converts to %s", (tsType, elmType) => {
  test("converts types correctly", () => {
    const source = `
    type Target = ${tsType};
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
    const type = checker.getTypeAtLocation(
      (ast.statements[0] as ts.TypeAliasDeclaration).type
    );
    expect(buildType(type, checker)).toEqual(elmType);
  });
});
