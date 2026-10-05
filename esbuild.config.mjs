import esbuild from "esbuild";

const context = await esbuild.context({
  entryPoints: ["main.ts"],
  bundle: true,
  platform: "node",
  target: "es2022",
  external: ["obsidian"],
  outfile: "main.js",
  logLevel: "info",
});

await context.watch();