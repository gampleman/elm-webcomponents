import { command, run, string, restPositionals } from "cmd-ts";
import { ExistingPath } from "cmd-ts/batteries/fs";
import { main } from "./transform";
import pkg from "../package.json";

const app = command({
  name: "elm-webcomponents",
  version: pkg.version,
  description: "Generates Elm code from annotated web components",
  args: {
    inputFiles: restPositionals({
      type: ExistingPath,
      description: "Typescript files containing webcomponents",
      displayName: "FILE",
    }),
  },
  handler: ({ inputFiles }) => {
    main(inputFiles);
  },
});

run(app, process.argv.slice(2));
