// Shared helpers of the tests under test/api: the public interface only, so
// that they run against src and against the bundles alike (test/api/target.js).
import { create_scope, yaml } from "./target.js";

let scope_count = 0;

/** A scope of its own, so that a test registers in no scope another test uses. */
export function fresh_scope() {
	return create_scope(`Test_${scope_count++}`);
}

/** A description given as an object, compiled from its JSON text (JSON is YAML 1.2). */
export function json_desc(object) {
	return yaml(JSON.stringify(object));
}

/** Registers Descriptions in a scope of their own; the result holds the scope too. */
export function register(descriptions) {
	const scope = fresh_scope();
	return { scope, ...scope.load(descriptions) };
}

/** Registers the items of one layout by name and returns the layout. */
export function register_items(name, items) {
	return register(json_desc({ layouts: [name], item_tables: { [name]: items } })).layouts[name];
}
