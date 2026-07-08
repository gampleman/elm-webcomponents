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

describe("custom ElmType imports", () => {
  const COMPONENT_WITH_CUSTOM = `
declare function component(name: string): any;
declare function required(a: any, c: any): any;
declare class CustomElement<T> {}

type ElmType<Base, Name extends string, Dec extends string = "", Enc extends string = "", Mods extends readonly string[] = []> =
  Base & { readonly __elmType__: Name; readonly __elmDecoder__: Dec; readonly __elmEncoder__: Enc; readonly __elmModules__: Mods; };
type Posix = ElmType<number, "Time.Posix", "Decode.map Time.millisToPosix Decode.int", "\\\\p -> Encode.int (Time.posixToMillis p)", ["Time"]>;

@component("clock-element")
class ClockElement extends CustomElement<{}> {
  @required accessor start!: Posix;
}
`;

  test("a component using a custom type emits the required import", () => {
    const host = ts.createCompilerHost({});
    const orig = host.getSourceFile;
    host.getSourceFile = (fileName, ...args) => {
      if (fileName === "input.ts") {
        return ts.createSourceFile(
          fileName,
          COMPONENT_WITH_CUSTOM,
          ts.ScriptTarget.Latest
        );
      }
      return orig(fileName, ...args);
    };
    const program = ts.createProgram(
      ["input.ts"],
      { strictNullChecks: true },
      host
    );
    const output = transform(["input.ts"], program);
    const elm = output.get("ClockElement.elm")!;
    expect(elm).toContain("import Time");
    expect(elm).toContain("start : Time.Posix");
  });
});
