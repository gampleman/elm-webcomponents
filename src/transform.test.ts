import { transform } from "./transform";
import * as ts from "typescript";
import path from "node:path";

// A self-contained component: the base class and decorator are declared inline
// so the in-memory program does not need to resolve the real ./index module.
const COMPONENT = `
declare function component(name: string): any;
declare class CustomElement<T> {}

@component("my-element")
class MyElement extends CustomElement<{}> {}
`;

const buildProgram = () => {
  const host = ts.createCompilerHost({});
  const orig = host.getSourceFile;
  host.getSourceFile = (fileName, ...args) => {
    if (fileName === "input.ts") {
      return ts.createSourceFile(fileName, COMPONENT, ts.ScriptTarget.Latest);
    }
    return orig(fileName, ...args);
  };
  return ts.createProgram(["input.ts"], { strictNullChecks: true }, host);
};

describe("module prefix", () => {
  test("without a prefix, emits a flat module name and file", () => {
    const output = transform(["input.ts"], buildProgram());
    expect([...output.keys()]).toEqual(["MyElement.elm"]);
    expect(output.get("MyElement.elm")).toContain(
      "module MyElement exposing"
    );
  });

  test("with a prefix, nests the module name and path", () => {
    const output = transform(["input.ts"], buildProgram(), "Components");
    const expectedPath = ["Components", "MyElement.elm"].join(path.sep);
    expect([...output.keys()]).toEqual([expectedPath]);
    expect(output.get(expectedPath)).toContain(
      "module Components.MyElement exposing"
    );
  });

  test("a prefix with a trailing dot is normalized", () => {
    const output = transform(["input.ts"], buildProgram(), "Components.");
    const expectedPath = ["Components", "MyElement.elm"].join(path.sep);
    expect(output.get(expectedPath)).toContain(
      "module Components.MyElement exposing"
    );
  });
});
