import { test, assert } from "vitest";
import { patchImportedModulesRecursively } from "./patch_imported_modules";
import { SourcePatchScriptData } from "../data";
import { SourcePatcher, SourcePatchImplementation } from "../patcher";

test(
    "matchingImportedScriptsGetPatched",
    async () => {
        let barPatcherRan = false;
        const dummyImportedSourceDownloadCallback = (url: string) => `/* ${url} */`;
        const patchers: SourcePatchImplementation[] = [
            patchImportedModulesRecursively(dummyImportedSourceDownloadCallback),
            [
                "https://example.com/bar",
                (..._patchFunctionArgs) => { barPatcherRan = true; },
            ]
        ];

        const scriptData = SourcePatchScriptData.ofModuleSource(
            `import { foo } from "./bar";`,
            "https://example.com/",
        )

        const sourcePatcher = new SourcePatcher(patchers);
        await sourcePatcher.patchDataToBlobUrl(scriptData);

        assert(barPatcherRan, "Patcher for imported module didn't run");
    }
);
