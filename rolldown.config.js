import { readFileSync, rmSync } from "node:fs";
import { defineConfig } from "rolldown";

// Each entry is bundled into a file of its own, with no shared chunk
// (doc/design.md §7). A library does not bundle its dependencies: they and
// the built-in modules of Node.js stay as imports.
const { dependencies = {} } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const dependency_names = Object.keys(dependencies);

/** Whether an import is left to the user's installation: a dependency (or a subpath of it) or a built-in module. */
function is_external(id) {
	if (id.startsWith("node:")) return true;
	return dependency_names.some((name) => id === name || id.startsWith(`${name}/`));
}

// no product of an earlier build is left in dist
rmSync(new URL("./dist", import.meta.url), { recursive: true, force: true });

/** The configuration that bundles one entry into dist. */
function entry(name) {
	return {
		input: `src/${name}.js`,
		platform: "node",
		external: is_external,
		output: {
			file: `dist/${name}.js`,
			format: "es",
		},
	};
}

export default defineConfig([entry("index"), entry("dev")]);
