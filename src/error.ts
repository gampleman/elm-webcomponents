import { DiagnosticsMessage } from "@dev-build-deploy/diagnose-it";
import * as ts from "typescript";

/**
 * Finds the most relevant source node to blame for a type, so that errors about
 * an unsupported type can point at where it was declared. Falls back to the
 * provided node (e.g. the property that referenced the type) when the type
 * itself has no declaration, as is the case for primitives.
 */
export const nodeFromType = (
  type: ts.Type,
  fallback?: ts.Node
): ts.Node | undefined => {
  return (
    type.symbol?.getDeclarations()?.[0] ??
    type.aliasSymbol?.getDeclarations()?.[0] ??
    fallback
  );
};

export class TransformError extends Error {
  public readonly diagnostic: DiagnosticsMessage;

  constructor(node: ts.Node | undefined, message: string) {
    super(message);

    if (node == null) {
      // We could not locate the offending type in source; still emit a
      // diagnostic so the CLI reports a useful message rather than crashing.
      this.diagnostic = DiagnosticsMessage.createError("<unknown>", {
        text: message,
      });
      return;
    }

    const sourceFile = node.getSourceFile();
    const loc = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

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
