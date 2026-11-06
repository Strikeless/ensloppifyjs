import { assert, test } from "vitest";
import { SourcePatcher, SourcePatchImplementation } from "../patcher";
import { resolveRelativeImports } from "./resolve_relative_imports";
import { SourcePatchScriptData } from "../data";

test(
    "relativeImportIsPatchedCorrectly",
    async () => {
        const patchers: SourcePatchImplementation[] = [
            resolveRelativeImports(),
        ];

        const scriptData = SourcePatchScriptData.ofModuleSource(
            `import { foo } from "./bar";`,
            "https://example.com/scripts/",
        )

        const sourcePatcher = new SourcePatcher(patchers);
        const patchedSourceBlobUrl = await sourcePatcher.patchDataToBlobUrl(scriptData);
        const patchedSource = await (await fetch(patchedSourceBlobUrl!)).text();

        console.log(patchedSource);
        assert(patchedSource == `import { foo } from "https://example.com/scripts/bar";`, "Import in source was not patched correctly")
    }
);

test(
    "relativeImportIsPatchedCorrectly_Complex",
    async () => {
        const patchers: SourcePatchImplementation[] = [
            resolveRelativeImports(),
        ];

        const scriptData = SourcePatchScriptData.ofModuleSource(
            `import { t as e } from "./rolldown-runtime-bwV8cYxwBQ-0muz9.js";`,
            "https://static3.songsterr.com/production-main/static3/latest/appClient-Dum2ppxQOoZ4aU-K.js",
        )

        const sourcePatcher = new SourcePatcher(patchers);
        const patchedSourceBlobUrl = await sourcePatcher.patchDataToBlobUrl(scriptData);
        const patchedSource = await (await fetch(patchedSourceBlobUrl!)).text();

        console.log(patchedSource);
        assert(patchedSource == `import { t as e } from "https://static3.songsterr.com/production-main/static3/latest/rolldown-runtime-bwV8cYxwBQ-0muz9.js";`, "Import in source was not patched correctly")
    }
);
