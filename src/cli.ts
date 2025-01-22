import { command, run, string, restPositionals, option } from "cmd-ts";
import { ExistingPath, Directory } from "cmd-ts/batteries/fs";
import { main } from "./transform";
import pkg from "../package.json";

const app = command({
  name: "elm-webcomponents",
  version: pkg.version,
  description: "Generates Elm code from annotated web components",
  args: {
    outputDir: option({
      type: Directory,
      description: "Output directory for generated Elm files",
      long: "output-dir",
      short: "o",
      defaultValue() {
        return "./elm-webcomponents";
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
