// Dispatch of events that does not stop at a listener that throws
// (doc/spec-data-api.md §4.4, doc/design.md §5.1). Internal.

/**
 * Calls every listener of an event, in the order they subscribed, and pushes
 * what a listener throws to `errors` instead of letting it stop the others.
 * A `once` listener removes itself as usual.
 *
 * @param {import("node:events").EventEmitter | undefined} emitter - Nothing happens for undefined.
 * @param {string} event
 * @param {any[]} args
 * @param {unknown[]} errors
 */
export function emit_all(emitter, event, args, errors) {
	if (!emitter) return;
	for (const listener of emitter.rawListeners(event)) {
		try {
			listener.apply(emitter, args);
		} catch (error) {
			errors.push(error);
		}
	}
}
