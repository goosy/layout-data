import { defineConfig } from "rolldown";
import ts from "typescript";

// The JSDoc in src is the source of the types: tsc emits the declaration
// files (dist/types, the "types" of package.json) once the bundle is written.
function emit_declarations() {
	return {
		name: "emit-declarations",
		closeBundle() {
			const config_path = ts.findConfigFile(".", ts.sys.fileExists, "tsconfig.json");
			const config = ts.getParsedCommandLineOfConfigFile(config_path, {}, {
				...ts.sys,
				onUnRecoverableConfigFileDiagnostic(diagnostic) {
					throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
				},
			});
			const program = ts.createProgram(config.fileNames, config.options);
			const result = program.emit();
			const diagnostics = ts.getPreEmitDiagnostics(program).concat(result.diagnostics);
			if (result.emitSkipped || diagnostics.length > 0) {
				throw new Error(ts.formatDiagnostics(diagnostics, {
					getCanonicalFileName: (name) => name,
					getCurrentDirectory: ts.sys.getCurrentDirectory,
					getNewLine: () => "\n",
				}));
			}
		},
	};
}

// yaml is a development dependency: it is bundled into the library.
export default defineConfig({
	input: "src/index.js",
	platform: "node",
	output: {
		file: "dist/tagged-data.js",
		format: "es",
	},
	plugins: [emit_declarations()],
});
