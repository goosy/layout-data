#!/usr/bin/env node
// The development entry layout-data/dev (doc/spec-layout.md §8): renders the
// TypeScript declarations of the layouts of descriptions, for editor completion.
// Run as the entry it is the command line tool layout-types (§8.1), which
// requires Node.js >= 24.2 for import.meta.main; the function itself works on
// the Node.js of the run-time entry.
import { realpathSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { layouts_of } from "./registry.js";
import { create_scope } from "./scope.js";
import { render_declarations } from "./types.js";

/** @import { Layout_Description } from "./typedefs.js" */

/** The Node.js version the command line requires, for import.meta.main. */
const CLI_NODE = "24.2";

const USAGE = `Usage: layout-types <description files...> [--scope <scope name>] [-o|--out <output file>]

Renders the TypeScript declarations of the layouts of the description files,
for editor completion of the tags (layout-data, doc/spec-layout.md §8).

  <description files...>  YAML description files
  --scope <scope name>    the scope name used in the example of the header
                          comment, "app" by default
  -o, --out <file>        the output file; the standard output without it
  -h, --help              show this help

Requires Node.js >= ${CLI_NODE} (import.meta.main); it is needed only to render
the types, not to run the application. On an earlier Node.js, or for layouts
given in code, call render_types of "layout-data/dev" in a script instead.`;

/**
 * Renders a TypeScript declaration file for all the layouts of descriptions,
 * for editor completion of the tags (doc/spec-layout.md §8). The descriptions
 * are registered in a scope created here. The text imports `Ldata` from
 * "layout-data", which the project rendering the types depends on.
 *
 * @param {string | Layout_Description | Array<string | Layout_Description>} descriptions - As for register_layout: the path of a YAML description file, a description object, or a list of them.
 * @param {object} [options]
 * @param {string} [options.scope] - The scope name used in the example of the header comment; "app" by default.
 * @param {string} [options.source] - The source named in the header; by default the description files, when all the descriptions are paths.
 * @returns {string}
 * @throws {Error} With `errors`, as register_layout, when the descriptions are not valid.
 * @throws {TypeError | Error} As create_scope, when the scope name is not valid.
 */
export function render_types(descriptions, { scope: scope_name = "app", source } = {}) {
	const scope = create_scope(scope_name);
	scope.register_layout(descriptions);
	const list = Array.isArray(descriptions) ? descriptions : [descriptions];
	if (source === undefined && list.every((description) => typeof description === "string")) source = list.join(", ");
	return render_declarations(scope.name, [...layouts_of(scope).values()], { source });
}

/**
 * The command line (doc/spec-layout.md §8.1): parses the arguments and calls
 * render_types. Writes the text to the output file or the standard output,
 * and the errors to the standard error.
 *
 * @param {string[]} args - The arguments after the script.
 * @returns {number} The exit code.
 */
function run_cli(args) {
	let parsed;
	try {
		parsed = parseArgs({
			args,
			allowPositionals: true,
			options: {
				scope: { type: "string", default: "app" },
				out: { type: "string", short: "o" },
				help: { type: "boolean", short: "h" },
			},
		});
	} catch (error) {
		process.stderr.write(`layout-types: ${error.message}\n\n${USAGE}\n`);
		return 1;
	}
	const { values, positionals: files } = parsed;
	if (values.help) {
		process.stdout.write(`${USAGE}\n`);
		return 0;
	}
	if (files.length === 0) {
		process.stderr.write(`layout-types: no description file is given\n\n${USAGE}\n`);
		return 1;
	}
	let text;
	try {
		text = render_types(files, { scope: values.scope });
	} catch (error) {
		const details = Array.isArray(error.errors) ? error.errors.map((item) => `  ${item}\n`).join("") : "";
		process.stderr.write(`layout-types: ${error.message}\n${details}`);
		return 1;
	}
	if (values.out === undefined) process.stdout.write(text);
	else writeFileSync(values.out, text);
	return 0;
}

/** Whether this file is the script node was started with, found without import.meta.main. */
function is_entry_file() {
	try {
		return process.argv[1] !== undefined && realpathSync(process.argv[1]) === import.meta.filename;
	} catch {
		return false;
	}
}

// true or false on Node.js >= 24.2, undefined before
const is_main = import.meta.main;
if (is_main === true) {
	process.exitCode = run_cli(process.argv.slice(2));
} else if (is_main === undefined && is_entry_file()) {
	process.stderr.write(`layout-types requires Node.js >= ${CLI_NODE}, and this is Node.js ${process.version}.
The command line needs it only to render the types, not to run the application.
Run it with a newer Node.js, or call render_types of "layout-data/dev" in a script:

  import { render_types } from "layout-data/dev";
  process.stdout.write(render_types("pump.yaml", { scope: "app" }));
`);
	process.exitCode = 1;
}
