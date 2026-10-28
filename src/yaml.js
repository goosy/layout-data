// Reading descriptions (doc/spec-description.md §1.1): yaml takes YAML text,
// desc_file reads a description file; both read the files they import and
// have layout.js compile them into a Description. Registration takes the
// Description and reads no file.
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocument } from "yaml";
import { compile_description, make_description } from "./layout.js";

/** @import { Description } from "./typedefs.js" */
/** @import { Source } from "./layout.js" */

/** The origin of a description written in code, named in errors. */
const TEXT_ORIGIN = "YAML text";

/**
 * Reads a description written in code, as YAML 1.2 text, and compiles it
 * into a Description. A tag of template literals, taking the raw text as
 * String.raw does, or called with the text. A relative path in its `imports`
 * is an error: the text has no file.
 *
 * @overload
 * @param {TemplateStringsArray} strings - The template, as a tag.
 * @param {...unknown} values - The interpolated values, put into the text as strings.
 * @returns {Description}
 */
/**
 * @overload
 * @param {string} text - The YAML text.
 * @returns {Description}
 */
/**
 * @param {TemplateStringsArray | string} source
 * @param {...unknown} values
 * @returns {Description}
 * @throws {Error} With `errors`, every error found, when the text is not valid YAML or not a valid description.
 * @throws {TypeError} When the text is not a string.
 */
export function yaml(source, ...values) {
	const text = is_template(source) ? String.raw(source, ...values) : source;
	if (typeof text !== "string") throw new TypeError("yaml takes YAML text, as a string or a template literal");
	return read_description("invalid YAML text", { origin: TEXT_ORIGIN, text });
}

/**
 * Reads a description file, as YAML 1.2, and compiles it into a Description
 * that remembers the path of the file. A tag of template literals, taking the
 * raw text as String.raw does, or called with a path or a file: URL. A
 * relative path is resolved against the current working directory, a relative
 * path in its `imports` against the directory of the file.
 *
 * @overload
 * @param {TemplateStringsArray} strings - The template of the path, as a tag.
 * @param {...unknown} values - The interpolated values, put into the path as strings.
 * @returns {Description}
 */
/**
 * @overload
 * @param {string | URL} file - The path of the description file, or its file: URL.
 * @returns {Description}
 */
/**
 * @param {TemplateStringsArray | string | URL} source
 * @param {...unknown} values
 * @returns {Description}
 * @throws {Error} With `errors`, every error found, when a file cannot be read, is not valid YAML or not a valid description.
 * @throws {TypeError} When the file is not a string or a file: URL.
 */
export function desc_file(source, ...values) {
	const file = is_template(source) ? String.raw(source, ...values) : source;
	let path;
	if (typeof file === "string") path = file;
	// fileURLToPath throws TypeError for a URL that is not file:
	else if (file instanceof URL) path = fileURLToPath(file);
	else throw new TypeError("desc_file takes the path of a description file, as a string, a template literal or a file: URL");
	const title = `invalid description file ${path}`;
	let text;
	try {
		text = readFileSync(path, "utf8");
	} catch (error) {
		throw description_error(title, [error.message]);
	}
	return read_description(title, { origin: path, path, text });
}

/** Whether the first argument is the template of a tagged template literal. */
function is_template(source) {
	return Array.isArray(source) && Array.isArray(/** @type {any} */ (source).raw);
}

/**
 * Loads the imports of a description and compiles it.
 *
 * @param {string} title - The title of the error.
 * @param {{ origin: string, path?: string, text: string }} entry - The description read.
 * @returns {Description}
 */
function read_description(title, entry) {
	const errors = [];
	const sources = load_imports(entry, errors);
	if (errors.length > 0) throw description_error(title, errors);
	const desc_process = compile_description(sources, errors);
	if (errors.length > 0) throw description_error(title, errors);
	return make_description(desc_process, entry.path);
}

/**
 * Parses a description and the files it imports, depth first
 * (doc/spec-description.md §4): a file counts once, by its resolved path, and
 * an import of a file on the current chain is a cycle.
 *
 * @param {{ origin: string, path?: string, text: string }} entry
 * @param {string[]} errors
 * @returns {Source[]} The description read first, then those it imports.
 */
function load_imports(entry, errors) {
	/** @type {Source[]} */
	const sources = [];
	const seen = new Set();
	const chain = [];
	const load = (origin, path, text) => {
		const prefix = path === undefined ? "" : `${origin}: `;
		const root = parse(text, prefix, errors);
		if (root === undefined) return;
		if (root === null || typeof root !== "object" || Array.isArray(root)) {
			errors.push(`${prefix}the root must be a mapping`);
			return;
		}
		sources.push({ origin, path, root });
		const imports = root.imports;
		if (imports === undefined) return;
		if (!Array.isArray(imports) || !imports.every((item) => typeof item === "string")) {
			errors.push(`${prefix}the root key \`imports\` must be a list of paths`);
			return;
		}
		const absolute = path === undefined ? undefined : resolve(path);
		chain.push(absolute);
		for (const item of imports) {
			const target = import_path(item, absolute, prefix, errors);
			if (target === undefined) continue;
			if (chain.includes(target)) {
				errors.push(`${prefix}circular import ${[...chain.slice(chain.indexOf(target)), target].join(" -> ")}`);
				continue;
			}
			if (seen.has(target)) continue;
			seen.add(target);
			let imported;
			try {
				imported = readFileSync(target, "utf8");
			} catch (error) {
				errors.push(`${target}: ${error.message}`);
				continue;
			}
			load(target, target, imported);
		}
		chain.pop();
	};
	if (entry.path !== undefined) seen.add(resolve(entry.path));
	load(entry.origin, entry.path, entry.text);
	return sources;
}

/**
 * The absolute path of an import: a file: URL converted, an absolute path as
 * it is, a relative path against the directory of the importing file.
 *
 * @param {string} item - An entry of `imports`.
 * @param {string | undefined} importer - The absolute path of the importing file, none for YAML text.
 * @param {string} prefix - The origin of the importing description, before an error.
 * @param {string[]} errors
 * @returns {string | undefined} Undefined after an error.
 */
function import_path(item, importer, prefix, errors) {
	if (item.startsWith("file:")) {
		try {
			return fileURLToPath(item);
		} catch (error) {
			errors.push(`${prefix}import ${item}: ${error.message}`);
			return undefined;
		}
	}
	if (isAbsolute(item)) return resolve(item);
	if (importer === undefined) {
		errors.push(`${prefix}import ${item}: YAML text has no file, so a relative path cannot be resolved; give an absolute path or a file: URL`);
		return undefined;
	}
	return resolve(dirname(importer), item);
}

/** The parsed YAML 1.2 text, undefined after a parse error. */
function parse(text, prefix, errors) {
	const doc = parseDocument(text, { version: "1.2" });
	if (doc.errors.length > 0) {
		errors.push(...doc.errors.map((e) => `${prefix}${e.message}`));
		return undefined;
	}
	return doc.toJS();
}

function description_error(title, errors) {
	const error = new Error(`${title}:\n${errors.join("\n")}`);
	error.errors = errors;
	return error;
}
