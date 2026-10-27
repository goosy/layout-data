// Scopes of layout names (doc/spec-layout.md §2).
import assert from "node:assert/strict";
import test, { describe } from "node:test";
import { create_scope, get_scope } from "../src/index.js";
import { layouts_of } from "../src/registry.js";
import { fresh_scope } from "./share.js";

const pump = (init_value) => ({ layouts: ["Pump"], item_tables: { Pump: [{ name: "a", type: "UInt", offset: 0, init_value }] } });

describe("6 scopes", () => {
	test("a scope name is an identifier, used once in the process", () => {
		const scope = create_scope("Sc_Lib");
		assert.equal(scope.name, "Sc_Lib");
		assert.throws(() => create_scope("Sc_Lib"), /^Error: a scope is already named Sc_Lib$/);
		for (const name of ["", "lib.a", "@scope/pkg", "my-lib", "1lib"]) {
			assert.throws(() => create_scope(name), /the name is not an identifier/, name);
		}
		for (const name of [undefined, null, 1, {}]) {
			assert.throws(() => create_scope(name), TypeError, String(name));
		}
		assert.throws(() => { scope.name = "x"; }, TypeError);
	});

	test("a scope is made by create_scope only", () => {
		const scope = fresh_scope();
		assert.throws(() => new scope.constructor("Sc_New"), /a scope is made by create_scope/);
		assert.equal(get_scope("Sc_New"), undefined);
	});

	test("a scope is frozen: no module can replace its methods or its name", () => {
		const scope = create_scope("Sc_Frozen");
		scope.register_layout(pump(7));
		assert.ok(Object.isFrozen(scope));
		assert.throws(() => { get_scope("Sc_Frozen").get_layout = () => null; }, TypeError);
		assert.throws(() => Object.defineProperty(scope, "name", { value: "Sc_Other" }), TypeError);
		assert.equal(scope.get_layout("Pump").create_ldata("t").a, 7);
	});

	test("the layout table of a scope is found by the scope object, not by its name", () => {
		const victim = create_scope("Sc_Victim");
		const other = create_scope("Sc_Other");
		// an object that reads as the victim by name reaches no layout table
		const spoofed = Object.create(other, { name: { value: "Sc_Victim" } });
		assert.equal(layouts_of(spoofed), undefined);
		assert.notEqual(layouts_of(other), layouts_of(victim));
		other.register_layout(pump(2));
		assert.throws(() => victim.get_layout("Pump"), /unknown layout Sc_Victim.Pump/);
	});

	test("get_scope gives the scope of a name, undefined when there is none", () => {
		const scope = create_scope("Sc_Got");
		assert.equal(get_scope("Sc_Got"), scope);
		assert.equal(get_scope("Sc_None"), undefined);
		assert.equal(get_scope(undefined), undefined);
	});

	test("each scope registers once; the second call throws naming the scope", () => {
		const scope = fresh_scope();
		scope.register_layout(pump(1));
		assert.throws(() => scope.register_layout(pump(2)), new RegExp(`^Error: register_layout can be called only once in scope ${scope.name}$`));
		assert.equal(scope.get_layout("Pump").items[0].init_value, 1);
	});

	test("a failed registration registers nothing and does not use up the call", () => {
		const scope = fresh_scope();
		assert.throws(() => scope.register_layout("no_such_layout_file.yaml"), (error) => Array.isArray(error.errors));
		assert.throws(() => scope.register_layout({
			layouts: ["Good", "Bad"],
			item_tables: { Good: pump(0).item_tables.Pump, Bad: [{ name: "a", type: "Byte", offset: 0, init_value: 0 }] },
		}), (error) => Array.isArray(error.errors));
		assert.throws(() => scope.get_layout("Good"), /unknown layout/);
		scope.register_layout(pump(9));
		assert.equal(scope.get_layout("Pump").create_ldata("t").a, 9);
	});

	test("any holder of a scope may register in it, once", () => {
		create_scope("Sc_Open");
		get_scope("Sc_Open").register_layout(pump(4));
		assert.equal(get_scope("Sc_Open").get_layout("Pump").create_ldata("t").a, 4);
		assert.throws(() => get_scope("Sc_Open").register_layout(pump(5)), /can be called only once/);
	});

	test("the same layout name in two scopes is two layouts, each with its own class", () => {
		const one = create_scope("Sc_One");
		const two = create_scope("Sc_Two");
		const first = one.register_layout(pump(1)).layouts.Pump;
		const second = two.register_layout(pump(2)).layouts.Pump;
		assert.notEqual(first, second);
		assert.deepEqual([first.name, first.scope, second.name, second.scope], ["Pump", one, "Pump", two]);
		const a = first.create_ldata("a");
		const b = second.create_ldata("b");
		assert.deepEqual([a.a, b.a], [1, 2]);
		assert.notEqual(Object.getPrototypeOf(a), Object.getPrototypeOf(b));
		assert.equal(a.constructor.name, "Ldata_Sc_One.Pump");
	});

	test("a layout name is unknown outside its scope, and the error names the scope", () => {
		const scope = fresh_scope();
		scope.register_layout(pump(3));
		assert.throws(() => fresh_scope().get_layout("Pump"), /^Error: unknown layout Test_\d+\.Pump$/);
		assert.throws(() => scope.get_layout("Valve"), new RegExp(`^Error: unknown layout ${scope.name}.Valve$`));
		assert.throws(() => scope.get_layout(`${scope.name}.Pump`), /unknown layout/);
	});

	test("the item tables of a scope are not seen from another one", () => {
		create_scope("Sc_Frag_A").register_layout({
			layouts: ["Pump"],
			item_tables: { ...pump(0).item_tables, bits: [{ name: "b", type: "Bool", offset: 0 }] },
		});
		assert.throws(() => create_scope("Sc_Frag_B").register_layout({
			layouts: ["W"],
			item_tables: { W: [{ name: "w", type: "Word", offset: 0, coupling: "bits" }] },
		}), /unknown item table bits/);
	});

	test("the errors of the data blocks name the scope of the layout", () => {
		const scope = fresh_scope();
		const { layouts } = scope.register_layout({ layouts: ["Osc"], item_tables: { Osc: [{ name: "a", type: "UInt", offset: 0, init_value: 0 }] } });
		const data = layouts.Osc.create_ldata("d");
		data.on("change", () => { data.a = data.a + 1; });
		assert.throws(() => { data.a = 1; }, new RegExp(`^Error: ${scope.name}.Osc: changes do not settle`));
	});
});
