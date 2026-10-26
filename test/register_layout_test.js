import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import test, { describe } from "node:test";

const INDEX = pathToFileURL(new URL("../src/index.js", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")).href;

/** Runs a script in a process of its own: register_layout works once per process. */
function run(script) {
	const output = execFileSync(process.execPath, ["--input-type=module", "-e", `import * as api from ${JSON.stringify(INDEX)};\n${script}`], { encoding: "utf8" });
	return JSON.parse(output);
}

describe("6.4 register_layout is called once", () => {
	test("the second call throws, the layouts of the first stay", () => {
		const result = run(`
			const one = [{ name: "a", type: "UInt", offset: 0, init_value: 5 }];
			api.register_layout({ layouts: { Once_A: one } });
			let message = "";
			try { api.register_layout({ layouts: { Once_B: one } }); } catch (error) { message = error.message; }
			let unknown = "";
			try { api.get_layout("Once_B"); } catch (error) { unknown = error.message; }
			console.log(JSON.stringify({ message, unknown, a: api.get_layout("Once_A").create_ldata("t").a }));
		`);
		assert.equal(result.message, "register_layout can be called only once");
		assert.match(result.unknown, /unknown layout Once_B/);
		assert.equal(result.a, 5);
	});

	test("a call that fails registers nothing and does not use up the call", () => {
		const result = run(`
			const good = [{ name: "a", type: "UInt", offset: 0, init_value: 1 }];
			const bad = [{ name: "a", type: "Byte", offset: 0, init_value: 0 }];
			let errors = [];
			try { api.register_layout({ layouts: { Retry_Good: good, Retry_Bad: bad } }); } catch (error) { errors = error.errors; }
			let unknown = "";
			try { api.get_layout("Retry_Good"); } catch (error) { unknown = error.message; }
			api.register_layout({ layouts: { Retry_Good: good } });
			console.log(JSON.stringify({ errors, unknown, a: api.get_layout("Retry_Good").create_ldata("t").a }));
		`);
		assert.ok(result.errors.length >= 1);
		assert.match(result.unknown, /unknown layout Retry_Good/);
		assert.equal(result.a, 1);
	});

	test("a missing file first, the default description after it", () => {
		const result = run(`
			let failed = false;
			try { api.register_layout("no_such_layout_file.yaml"); } catch { failed = true; }
			api.register_layout({ layouts: { Fallback: [{ name: "a", type: "UInt", offset: 0, init_value: 9 }] } });
			console.log(JSON.stringify({ failed, a: api.get_layout("Fallback").create_ldata("t").a }));
		`);
		assert.deepEqual(result, { failed: true, a: 9 });
	});
});
