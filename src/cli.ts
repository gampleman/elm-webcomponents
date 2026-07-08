import { command, run, string, restPositionals, option } from "cmd-ts";
import { ExistingPath } from "cmd-ts/batteries/fs";
import { main } from "./transform";
import pkg from "../package.json";

const app = command({
  name: "elm-webcomponents",
  version: pkg.version,
  description: "Generates Elm code from annotated web components",
  args: {
    outputDir: option({
      // A plain string (not cmd-ts's `Directory`, which requires the path to
      // already exist): `main` creates the output directory if needed.
      type: string,
      description: "Output directory for generated Elm files (created if missing)",
      long: "output-dir",
      short: "o",
      defaultValue() {
        return "./elm-webcomponents";
      },
    }),
    modulePrefix: option({
      type: string,
      description:
        "Optional dotted Elm module prefix for generated modules (e.g. 'Components' produces module Components.MyElement in Components/MyElement.elm)",
      long: "module-prefix",
      short: "p",
      defaultValue() {
        return "";
      },
    }),
    inputFiles: restPositionals({
      type: ExistingPath,
      description: "Typescript files containing webcomponents",
      displayName: "FILE",
    }),
  },
  handler: main,
});

run(app, process.argv.slice(2));
