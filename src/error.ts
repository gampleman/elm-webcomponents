import { DiagnosticsMessage } from "@dev-build-deploy/diagnose-it";
import * as ts from "typescript";

// A declaration that lives in a `.d.ts` file (e.g. the definition of `Record`
// or `Array` in TypeScript's own lib files) is useless to blame in an error:
// it points into node_modules rather than the user's code. We only want to
// point at nodes that come from the sources we are actually processing.
const isUserNode = (node: ts.Node | undefined): node is ts.Node =>
  node != null && !node.getSourceFile().isDeclarationFile;

/**
 * Finds the most relevant source node to blame for a type, so that errors about
 * an unsupported type can point at where it was used. Prefers the type's own
 * declaration, but only when that declaration is in the user's own code; for
 * library types (and primitives, which have no declaration) it falls back to
 * the provided node, i.e. the place the type was referenced.
 */
export const nodeFromType = (
  type: ts.Type,
  fallback?: ts.Node
): ts.Node | undefined => {
  const declaration =
    type.symbol?.getDeclarations()?.[0] ??
    type.aliasSymbol?.getDeclarations()?.[0];
  if (isUserNode(declaration)) {
    return declaration;
  }
  return fallback;
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
