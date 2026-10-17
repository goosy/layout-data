// The reserved names (doc/spec-data-api.md §2.10, doc/design.md §4). Internal:
// index.js does not export this file.

/**
 * Names a tag must not have: the members of Ldata, the method and field names
 * of EventEmitter in Node.js 20.11 and the names of Object.prototype. A static
 * list, so that it does not depend on the Node.js version that runs the program.
 */
const RESERVED_NAMES = new Set([
	// members of Ldata
	"name", "layout", "size", "get", "transaction",
	"read_bytes", "write_bytes", "write_bit", "load_tag", "store_tag",
	// EventEmitter
	"addListener", "emit", "eventNames", "getMaxListeners", "listenerCount", "listeners",
	"off", "on", "once", "prependListener", "prependOnceListener", "rawListeners",
	"removeAllListeners", "removeListener", "setMaxListeners",
	"_events", "_eventsCount", "_maxListeners",
	// Object
	"constructor", "hasOwnProperty", "isPrototypeOf", "propertyIsEnumerable",
	"toLocaleString", "toString", "valueOf", "__proto__",
	"__defineGetter__", "__defineSetter__", "__lookupGetter__", "__lookupSetter__",
]);

/** Event names of the library; a user does not emit them or use them for its own events. */
export const RESERVED_EVENTS = Object.freeze(["change", "write", "access", "read"]);

/**
 * Whether a tag name would shadow a member of a data block.
 *
 * @param {string} name
 * @returns {boolean}
 */
export function is_reserved_name(name) {
	return RESERVED_NAMES.has(name);
}
