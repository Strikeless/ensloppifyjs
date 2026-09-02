import * as esbuild from "esbuild";
import fs from "node:fs/promises";

// Clean old build output.
await fs.rm("./dist", { recursive: true, force: true });

const commonBundleOptions: esbuild.BuildOptions = {
    entryPoints: ["./src/index.ts"],
    bundle: true,
    minify: true,
    sourcemap: true,
    treeShaking: true,
    legalComments: "inline",
};

// Bundle for ESM, to be used in Node or browsers.
await esbuild.build({
    ...commonBundleOptions,
    outfile: "./dist/esm/index.mjs",
    format: "esm",
    platform: "neutral",
    target: ["es2022"],
})

// Bundle for IIFE, to be used in browsers.
await esbuild.build({
    ...commonBundleOptions,
    outfile: "./dist/iife/index.js",
    format: "iife",
    globalName: "Ensloppify",
    platform: "browser",
    target: ["es2022"],
});
