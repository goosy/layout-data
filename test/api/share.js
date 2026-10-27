// Shared helpers of the tests under test/api: the public interface only, so
// that they run against src and against the bundles alike (test/api/target.js).
import { create_scope } from "./target.js";

let scope_count = 0;

/** A scope of its own, so that a test can register: a scope registers once. */
export function fresh_scope() {
	return create_scope(`Test_${scope_count++}`);
}

/** Registers descriptions in a scope of their own; the result holds the scope too. */
export function register(descriptions) {
	const scope = fresh_scope();
	return { scope, ...scope.register_layout(descriptions) };
}

/** Registers the items of one layout by name, as a user does in code, and returns the layout. */
export function register_items(name, items) {
	return register({ layouts: { [name]: items } }).layouts[name];
}
