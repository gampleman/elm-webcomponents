import { buildType } from "./type";
import { buildEncoder } from "./encoder";
import { buildDecoder } from "./decoder";
import { TransformError } from "../error";
import * as ts from "typescript";
import { query } from "@phenomnomnominal/tsquery";

const withType = (tsType: string, fn: (type: ts.Type, checker: ts.TypeChecker, node: ts.Node) => void) => {
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

  const program = ts.createProgram(["input.ts"], { strictNullChecks: true }, host);
  const checker = program.getTypeChecker();
  const ast = program.getSourceFile("input.ts")!;
  query(ast, "VariableDeclaration").forEach((stmt) => {
    const type = checker.getTypeAtLocation(
      (stmt as ts.VariableDeclaration).type!
    );
    fn(type, checker, stmt);
  });
};

describe.each([
  ["bigint", "BigInt"],
  ["symbol", "Symbol"],
])("unsupported type %s", (tsType, label) => {
  test("buildType throws a located TransformError", () => {
    expect.assertions(2);
    withType(tsType, (type, checker, node) => {
      try {
        buildType(type, checker, node);
      } catch (e) {
        expect(e).toBeInstanceOf(TransformError);
        // diagnostic string carries the source location context
        expect((e as TransformError).diagnostic.toString()).toContain("input.ts");
      }
    });
  });

  test("buildEncoder throws a TransformError", () => {
    expect.assertions(1);
    withType(tsType, (type, checker) => {
      try {
        buildEncoder(type, "value", checker, new Map());
      } catch (e) {
        expect(e).toBeInstanceOf(TransformError);
      }
    });
  });

  test("buildDecoder throws a TransformError", () => {
    expect.assertions(1);
    withType(tsType, (type, checker) => {
      try {
        buildDecoder(type, checker, new Map());
      } catch (e) {
        expect(e).toBeInstanceOf(TransformError);
      }
    });
  });
});
