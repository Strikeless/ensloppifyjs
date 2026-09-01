import { test, assert } from "vitest";
import { patchModuleImportsRecursively } from "./module";
import { findImports, findImportsRecursive } from "./module.internal";
import { SourcePatchScriptData } from "../data";
import { SourcePatcher, SourcePatchImplementation } from "../lib";

test(
    "findImports_findsImports",
    () => {
        const scriptData = new SourcePatchScriptData(
            `
                import("./foo");
                import default as "_buzz", * as _bar from "../bar.js";
                import data from "data.json" with { type: "json" };
            `,
            "https://example.com/foobar/test.js",
        );

        const foundImports = findImports(scriptData);
        console.log(foundImports);

        const expectedImportSourceValues = [
            "./foo",
            "../bar.js",
            "data.json",
        ];

        for (const expectedImportSourceValue of expectedImportSourceValues) {
            assert(
                foundImports.findIndex(imp => imp.sourceValue == expectedImportSourceValue) != -1,
                `Didn't find "${expectedImportSourceValue}"`
            );
        }
    }
);
test(
    "findImports_resolvesUrls",
    () => {
        const scriptData = new SourcePatchScriptData(
            `
                import("./foo");
                import("../bar.js");
                import("buzz");
            `,
            "https://example.com/foobar/test.js",
        );
        const foundImports = findImports(scriptData);

        const expectedResolvedSourceUrls = [
            ["./foo", "https://example.com/foobar/foo"],
            ["../bar.js", "https://example.com/bar.js"],
            ["buzz", "https://example.com/foobar/buzz"],
        ];

        for (const [expectedSourceValue, expectedResolvedSourceUrl] of expectedResolvedSourceUrls) {
            const expectedImport = foundImports.find(imp => imp.sourceValue == expectedSourceValue);
            assert(
                typeof expectedImport != "undefined",
                `Didn't find import "${expectedSourceValue}"`
            );
            assert(
                expectedImport.resolvedSourceUrl == expectedResolvedSourceUrl,
                `"${expectedImport.sourceValue}" resolved incorrectly: "${expectedImport.resolvedSourceUrl}" (expected "${expectedResolvedSourceUrl}")`
            );
        }
    }
);

test(
    "findImportsRecursive_findsRecursiveImport",
    async () => {
        const dummyImportedSourceDownloadCallback = (sourceUrl: string) => {
            switch (sourceUrl) {
                case "https://example.com/a": {
                    console.log("Resolved A");
                    return `import("./b")`;
                }
                case "https://example.com/b": {
                    console.log("Resolved B");
                    return `/* OK */`;
                }
                default: throw new Error(`Unexpected resolve: "${sourceUrl}"`);
            }
        };

        const scriptData = new SourcePatchScriptData(
            `import("./a")`,
            "https://example.com/",
        );

        const foundImports = await findImportsRecursive(scriptData, dummyImportedSourceDownloadCallback);
        console.log(foundImports);

        assert(
            foundImports.findIndex(imp => imp.sourceValue == "./a") != -1,
            "Didn't find immediate import ./a",
        );
        assert(
            foundImports.findIndex(imp => imp.sourceValue == "./b") != -1,
            "Didn't find recursed import ./b",
        );
    }
);

test(
    "findImportsRecursive_doesntGetStuckOnLoopingImport",
    async () => {
        const dummyImportedSourceDownloadCallback = (sourceUrl: string) => {
            switch (sourceUrl) {
                case "https://example.com/a": {
                    console.log("Resolved A");
                    return `import("./b")`;
                }
                case "https://example.com/b": {
                    console.log("Resolved B");
                    return `import("./a")`;
                }
                default: throw new Error(`Unexpected resolve: "${sourceUrl}"`);
            }
        };

        const scriptData = new SourcePatchScriptData(
            `import("./a")`,
            "https://example.com/",
        );

        const foundImports = await findImportsRecursive(scriptData, dummyImportedSourceDownloadCallback);
        console.log(foundImports);
    }
);

test(
    "matchingImportedScriptsGetPatched",
    async () => {
        const dummyImportedSourceDownloadCallback = (url: string) => `/* ${url} */`;

        let barPatcherRan = false;

        const patchers: SourcePatchImplementation[] = [
            patchModuleImportsRecursively(dummyImportedSourceDownloadCallback),
            [
                "https://example.com/bar",
                (..._patchFunctionArgs) => { barPatcherRan = true; },
            ]
        ];

        const sourcePatcher = new SourcePatcher(patchers);
        await sourcePatcher.patchSourceToBlobUrl(`import { foo } from "./bar";`, new URL("https://example.com/"));

        assert(barPatcherRan, "Patcher for imported module didn't run");
    }
);
