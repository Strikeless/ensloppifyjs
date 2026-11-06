import { type SourcePatchCondition, type SourcePatchFunction } from "../patcher";
import { Util } from "..";
import { MassReplacer } from "../util";

export function resolveRelativeImports(): [SourcePatchCondition, SourcePatchFunction] {
    const patchFunction: SourcePatchFunction = (scriptData, _sourcePatcher) => {
        const sourceReplacer = new MassReplacer(scriptData.source);
        const directImports = Util.findImports(scriptData);

        for (const foundImport of directImports) {
            if (foundImport.resolvedSourceUrl == null) {
                // The source URL failed to resolve, not much we can do here.
                continue;
            }

            if (foundImport.resolvedSourceUrl == foundImport.sourceValue) {
                // The source URL is absolute (resolved to itself), no need to change it.
                continue;
            }

            sourceReplacer.replaceRange(
                foundImport.sourceValueStartIndex,
                foundImport.sourceValueEndIndex,
                `"${foundImport.resolvedSourceUrl}"`
            );
        }

        scriptData.source = sourceReplacer.apply();
    };

    const patchCondition: SourcePatchCondition = (scriptData, _sourcePatcher) => {
        const directImports = Util.findImports(scriptData);

        for (const foundImport of directImports) {
            if (foundImport.resolvedSourceUrl == null) {
                // The source URL failed to resolve, not much we can do here.
                continue;
            }

            if (foundImport.resolvedSourceUrl == foundImport.sourceValue) {
                // The source URL is absolute (resolved to itself), no need to change it.
                continue;
            }

            // This import needs to be resolved, so we need patching.
            return true;
        }

        // No import needed to (or could be) be resolved, nothing to patch.
        return false;
    };

    return [patchCondition, patchFunction];
}
