import { register } from "node:module";
import { pathToFileURL } from "node:url";

register(new URL("./ts_loader.js", import.meta.url), pathToFileURL("./"));
