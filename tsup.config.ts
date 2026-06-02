import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    cli: "src/cli.ts",
    mcp: "src/mcp.ts",
  },
  format: ["esm"],
  target: "node18",
  dts: { entry: { index: "src/index.ts" } },
  clean: true,
  splitting: false,
  sourcemap: true,
  shims: false,
  banner: ({ format }) => {
    return format === "esm" ? { js: "#!/usr/bin/env node" } : {};
  },
});
