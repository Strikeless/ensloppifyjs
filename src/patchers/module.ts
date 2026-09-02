import { findImports, findImportsRecursive, scriptDataFromImportAndSource } from "./module.internal";
import { SourceDownloadCallback, SourcePatchCondition, SourcePatchFunction } from "../patcher";

export function patchModuleImportsRecursively(
    importedSourceDownloadCallback: SourceDownloadCallback,
): [SourcePatchCondition, SourcePatchFunction] {
    const cachingSourceDownloadCallback = cachedSourceDownloadCallback(importedSourceDownloadCallback);

    const patchFunction: SourcePatchFunction = async (sourcePatcher, scriptData) => {
        /*
         * Some module imported by this script (including sub-imports) needs to be patched.
         * Run any relevant source patches on imported modules, and update the imports to point to the patched modules.
         * Note that this will recursively apply this patch, taking care of sub-imports as well.
         */
        const directImports = findImports(scriptData);

        for (const foundImport of directImports) {
            const importedScriptSource = await cachingSourceDownloadCallback(foundImport.resolvedSourceUrl);
            const importedScriptData = scriptDataFromImportAndSource(foundImport, importedScriptSource);

            // Patch the imported script, getting a blob URL of the patched version that we can replace the import with.
            // Note that if any sub-imports need to be patched, this will get applied recursively.
            const patchedImportedScriptBlobUrl = await sourcePatcher.patchDataToBlobUrl(importedScriptData);
            if (patchedImportedScriptBlobUrl == null) {
                // This imported script doesn't need any patching, nothing to replace the import with.
                continue;
            }

            // Patch the import statement/expression to point to the patched version of the imported script.
            scriptData.source = stringReplaceAtBounds(
                scriptData.source,
                foundImport.sourceValueStartIndex,
                foundImport.sourceValueEndIndex,
                `"${patchedImportedScriptBlobUrl.href}"`,
            );
        }
    };

    const patchCondition: SourcePatchCondition = async (sourcePatcher, scriptData) => {
        /*
         * Check if any module imported by this script (including sub-imports) needs to be patched.
         * If so, then this script will also need to be patched to update the imports to point to patched versions of the imported scripts.
         */

        // We're doing the recursion manually instead of letting the source patcher handle that,
        // because this way we can detect and prevent getting stuck in import-loops.
        const recursivelyFoundImports = await findImportsRecursive(scriptData, cachingSourceDownloadCallback);

        for (const foundImport of recursivelyFoundImports) {
            const importedScriptSource = await cachingSourceDownloadCallback(foundImport.resolvedSourceUrl);
            const importedScriptData = scriptDataFromImportAndSource(foundImport, importedScriptSource);

            const importedScriptNeedsPatching = await sourcePatcher.needsPatching(
                importedScriptData,
                // Don't check for this patch condition at all, since we're already recursing the imports here.
                // If we let the source patcher do the recursion then we wouldn't be able to prevent getting stuck in import-loops.
                { exceptPatchFunctions: [patchFunction] }
            );

            if (importedScriptNeedsPatching) {
                // A script imported somewhere down the chain needs some patching, so this script must also be patched to point to the patched script.
                // It doesn't matter if the script that needs patching is a sub-import (this imports A, which imports B), because the module importing it (A)
                // will need to be fixed to update the import source (to point to the patched B), and that chain of fixes propagates all the way to the root script.
                return true;
            }
        }

        return false;
    };

    return [patchCondition, patchFunction];
}

function cachedSourceDownloadCallback(originalSourceDownloadCallback: SourceDownloadCallback): SourceDownloadCallback {
    const sourceDownloadCache: Map<string, string> = new Map();

    return async (importedSourceUrl: string) => {
        const cachedSource = sourceDownloadCache.get(importedSourceUrl);
        if (typeof cachedSource != "undefined") return cachedSource;

        const downloadedSource = await originalSourceDownloadCallback(importedSourceUrl);
        sourceDownloadCache.set(importedSourceUrl, downloadedSource);
        return downloadedSource;
    };
}

function stringReplaceAtBounds(str: string, replaceStartIndex: number, replaceEndIndex: number, replacement: string): string {
    const strPreReplacement = str.slice(0, replaceStartIndex);
    const strPostReplacement = str.slice(replaceEndIndex + 1);
    return strPreReplacement + replacement + strPostReplacement;
}
