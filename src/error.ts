import { DiagnosticsMessage } from "@dev-build-deploy/diagnose-it";
import * as ts from "typescript";

export class TransformError extends Error {
  public readonly diagnostic: DiagnosticsMessage;

  constructor(node: ts.Node, message: string) {
    const sourceFile = node.getSourceFile();
    const loc = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

    super(message);

    const lines = sourceFile
      .getFullText()
      .split("\n")
      .slice(Math.max(0, loc.line - 2), end.line + 2)
      .join("\n");

    this.diagnostic = DiagnosticsMessage.createError(sourceFile.fileName, {
      text: message,
      linenumber: loc.line + 1,
      column: loc.character + 1,
    }).setContext(Math.max(1, loc.line - 1), lines);
  }
}

export const handler = (err: TransformError) => {
  console.error(err.diagnostic.toString());
};
