import { defineConfig } from "rolldown";

// yaml is a development dependency: it is bundled into the library.
export default defineConfig({
	input: "src/index.js",
	platform: "node",
	output: {
		file: "dist/tagged-data.js",
		format: "es",
	},
});
