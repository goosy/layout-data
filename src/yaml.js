// YAML into description objects (doc/spec-description.md §1.1): yaml parses
// YAML text, yaml_file reads and parses a description file. Registration
// takes the objects and reads no file.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseDocument } from "yaml";
import { ORIGIN } from "./internal.js";

/** @import { Layout_Description } from "./typedefs.js" */

/**
 * Parses YAML 1.2 text into a description object. A tag of template
 * literals, taking the raw text as String.raw does, or called with the text.
 * The structure is checked by registration, not here.
 *
 * @overload
 * @param {TemplateStringsArray} strings - The template, as a tag.
 * @param {...unknown} values - The interpolated values, put into the text as strings.
 * @returns {Layout_Description}
 */
/**
 * @overload
 * @param {string} text - The YAML text.
 * @returns {Layout_Description}
 */
/**
 * @param {TemplateStringsArray | string} source
 * @param {...unknown} values
 * @returns {Layout_Description}
 * @throws {Error} With `errors`, the parse errors, when the text is not valid YAML.
 * @throws {TypeError} When the text is not a string.
 */
export function yaml(source, ...values) {
	const text = is_template(source) ? String.raw(source, ...values) : source;
	if (typeof text !== "string") throw new TypeError("yaml takes YAML text, as a string or a template literal");
	return parse(text, "invalid YAML text", "");
}

/**
 * Reads a description file and parses it, as YAML 1.2, into a description
 * object that remembers the path of the file. A tag of template literals,
 * taking the raw text as String.raw does, or called with a path or a file:
 * URL. A relative path is resolved against the current working directory.
 *
 * @overload
 * @param {TemplateStringsArray} strings - The template of the path, as a tag.
 * @param {...unknown} values - The interpolated values, put into the path as strings.
 * @returns {Layout_Description}
 */
/**
 * @overload
 * @param {string | URL} file - The path of the description file, or its file: URL.
 * @returns {Layout_Description}
 */
/**
 * @param {TemplateStringsArray | string | URL} source
 * @param {...unknown} values
 * @returns {Layout_Description}
 * @throws {Error} With `errors`, when the file cannot be read or is not valid YAML.
 * @throws {TypeError} When the file is not a string or a file: URL.
 */
export function yaml_file(source, ...values) {
	const file = is_template(source) ? String.raw(source, ...values) : source;
	let path;
	if (typeof file === "string") path = file;
	// fileURLToPath throws TypeError for a URL that is not file:
	else if (file instanceof URL) path = fileURLToPath(file);
	else throw new TypeError("yaml_file takes the path of a description file, as a string, a template literal or a file: URL");
	const title = `invalid description file ${path}`;
	let text;
	try {
		text = readFileSync(path, "utf8");
	} catch (error) {
		throw yaml_error(title, [error.message]);
	}
	const description = parse(text, title, `${path}: `);
	if (description !== null && typeof description === "object") Object.defineProperty(description, ORIGIN, { value: path });
	return description;
}

/** Whether the first argument is the template of a tagged template literal. */
function is_template(source) {
	return Array.isArray(source) && Array.isArray(/** @type {any} */ (source).raw);
}

function parse(text, title, prefix) {
	const doc = parseDocument(text, { version: "1.2" });
	if (doc.errors.length > 0) throw yaml_error(title, doc.errors.map((e) => `${prefix}${e.message}`));
	return doc.toJS();
}

function yaml_error(title, errors) {
	const error = new Error(`${title}:\n${errors.join("\n")}`);
	error.errors = errors;
	return error;
}
