// Tests of the bundles in dist (doc/design.md §7), built by pnpm test before node --test.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { describe } from "node:test";

const package_url = new URL("../package.json", import.meta.url);
const package_json = JSON.parse(readFileSync(package_url, "utf8"));
const dependency_names = Object.keys(package_json.dependencies ?? {});

/** The text of a bundle, by its path in package.json. */
function bundle_text(path) {
	return readFileSync(new URL(path, package_url), "utf8");
}

/** The module specifiers of the static imports of a bundle. */
function imported_modules(text) {
	return [...text.matchAll(/^import\s(?:[^"';]*\sfrom\s)?"([^"]+)";?$/gm)].map((match) => match[1]);
}

const ENTRIES = [
	{ specifier: "layout-data", source: "../src/index.js", file: package_json.exports["."].default },
	{ specifier: "layout-data/dev", source: "../src/dev.js", file: package_json.exports["./dev"].default },
];

describe("7 the bundles of the entries", () => {
	test("the bin is the bundle of the development entry", () => {
		assert.equal(package_json.bin["layout-types"], package_json.exports["./dev"].default);
	});

	for (const { specifier, source, file } of ENTRIES) {
		test(`${specifier} is a bundle in dist with the exports of ${source}`, async () => {
			assert.match(file, /^\.\/dist\/[^/]+\.js$/);
			const bundled = await import(specifier);
			const original = await import(source);
			assert.equal(import.meta.resolve(specifier), new URL(file, package_url).href);
			assert.deepEqual(Object.keys(bundled).sort(), Object.keys(original).sort());
		});

		test(`${specifier} imports only dependencies and built-in modules, and no file of its own`, () => {
			const modules = imported_modules(bundle_text(file));
			assert.ok(modules.length > 0);
			for (const module of modules) {
				const external = module.startsWith("node:") || dependency_names.some((name) => module === name || module.startsWith(`${name}/`));
				assert.ok(external, `${file} imports ${module}`);
			}
		});
	}

	test("yaml is imported by the bundles, not bundled into them", () => {
		for (const { file } of ENTRIES) {
			const text = bundle_text(file);
			assert.ok(imported_modules(text).includes("yaml"), file);
			// the classes of yaml would be defined in the bundle if it were bundled
			assert.doesNotMatch(text, /\bclass (Composer|Lexer|Parser)\b/, file);
		}
	});

	test("the run-time bundle has no code of the development entry", () => {
		const text = bundle_text(package_json.exports["."].default);
		for (const word of ["render_declarations", "run_cli", "layout-types", "import.meta.main"]) {
			assert.equal(text.includes(word), false, word);
		}
	});

	test("the development bundle keeps the hashbang, so the bin runs with node", () => {
		assert.ok(bundle_text(package_json.bin["layout-types"]).startsWith("#!/usr/bin/env node\n"));
	});
});
