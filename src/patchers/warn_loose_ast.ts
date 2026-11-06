import type { SourcePatchCondition, SourcePatchFunction } from "../patcher";

export function warnOnLooseAst(alwaysParse: boolean = false, logFunction: (message: string) => void = defaultLogFunction): [SourcePatchCondition, SourcePatchFunction] {
    const patchCondition: SourcePatchCondition = (scriptData, _sourcePatcher) => {
        if (alwaysParse) {
            scriptData.parseAstIfOutdated();
        }

        // NOTE: This does NOT trigger parsing an AST, isAstLoose will just be null if an AST hasn't been parsed.
        if (scriptData.isAstLoose) {
            logFunction(`AST was parsed loosely for script from '${scriptData.sourceOriginCanonicalUrl}'`);
        }

        // This "patcher" never needs to patch anything. It's just here to warn about loosely parsed ASTs.
        return false;
    };
    
    const patchFunction: SourcePatchFunction = (..._) => {};

    return [patchCondition, patchFunction];
}

function defaultLogFunction(message: string) {
    console.log(`[EnsloppifyJS] ${message}`);
}
