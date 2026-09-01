import { SourcePatchScriptData } from "./data";

export type SourcePatchCondition = string
    | RegExp
    | ((sourcePatcher: SourcePatcher, scriptData: SourcePatchScriptData) => boolean | Promise<boolean>);
export type SourcePatchFunction = (sourcePatcher: SourcePatcher, scriptData: SourcePatchScriptData) => void | Promise<void>;
export type SourcePatchImplementation = [SourcePatchCondition, SourcePatchFunction];

export type SourcePatcherOptions = {
    /**
     * Whether to use a patched blob URL even for scripts that didn't match any patch function.
     * This can help avoid requesting scripts twice when using a recursive module patcher which
     * requests a script and only then determines it doesn't need to be patched.
     */
    alwaysUsePatched?: boolean,
};

export class SourcePatcher {
    private patchFunctions: SourcePatchImplementation[];
    private options: SourcePatcherOptions;

    private patchedBlobUrlsByOriginalUrl: Map<string, URL | null> = new Map();

    private matchingPatchFunctionsCache: Map<string, SourcePatchFunction[]> = new Map();

    constructor(
        patchFunctions: SourcePatchImplementation[],
        options: SourcePatcherOptions = {},
    ) {
        this.patchFunctions = patchFunctions;
        this.options = options;
    }

    public async patchSourceToBlobUrl(scriptSource: string, scriptOriginCanonicalUrl: URL): Promise<URL> {
        const scriptData = new SourcePatchScriptData(scriptSource, scriptOriginCanonicalUrl.href);
        return await this.patchDataToBlobUrl(scriptData);
    }

    public async patchDataToBlobUrl(scriptData: SourcePatchScriptData): Promise<URL> {
        const alreadyPatchedScriptBlobUrl = this.patchedBlobUrlsByOriginalUrl.get(scriptData.sourceOriginUrl);
        switch (alreadyPatchedScriptBlobUrl) {
            // This script has not yet been patched.
            case undefined: break;
            // This script has already been checked and does not require any patching/fixing. Return the URL of the original script.
            case null: return new URL(scriptData.sourceOriginUrl);
            // This script has already been checked and patched. Return the blob URL to the patched script.
            default: return alreadyPatchedScriptBlobUrl;
        }

        const newlyPatchedScriptSource = await this.getPatchedSource(scriptData);

        if (newlyPatchedScriptSource == null) {
            // This script didn't require any patching. Just cache the result and keep using the original script URL.
            this.patchedBlobUrlsByOriginalUrl.set(scriptData.sourceOriginUrl, null);
            return new URL(scriptData.sourceOriginUrl);
        }

        const newlyPatchedScriptBlobUrl = new URL(
            URL.createObjectURL(
                new Blob(
                    [newlyPatchedScriptSource],
                    { type: "text/javascript" }
                )
            )
        );
        // We must save the blob URL to the patched script so that we'll know to refer to the same,
        // already previously patched version if this script gets patched again (due to recursiveImportPatch, for example).
        // Not only is this an optimization, it's also required to preserve the "execute once" module behavior when the script is imported many times.
        this.patchedBlobUrlsByOriginalUrl.set(scriptData.sourceOriginUrl, newlyPatchedScriptBlobUrl);

        return newlyPatchedScriptBlobUrl;
    }

    public revokePatchedBlobUrls() {
        for (const patchedScriptBlobUrl of this.patchedBlobUrlsByOriginalUrl.values()) {
            if (patchedScriptBlobUrl == null) {
                // This script didn't need any patching/fixing, so there's no blob URL to a patched version.
                continue;
            }

            URL.revokeObjectURL(patchedScriptBlobUrl.href);
        }

        // Now that all the blob URLs to the patched scripts have been revoked, there's no need to hold onto these now unusable URLs.
        // Clear the map to make sure that we don't keep using these now unusable URLs if more scripts are patched with this instance.
        this.patchedBlobUrlsByOriginalUrl.clear();
    }

    public async getMatchingPatchFunctions(
        scriptData: SourcePatchScriptData,
        options: {
            exceptPatchFunctions: SourcePatchFunction[],
        } = {
            exceptPatchFunctions: [],
        }
    ): Promise<SourcePatchFunction[]> {
        // See if we've already tested for matching patch functions and use past results if we have.
        // This must be cached since function patch conditions could A) be slow, and B) be non-deterministic, which would cause bugs without caching.
        // The core API by itself only checks matching patch functions once, but patch conditions are allowed to test for other matching patch conditions.
        const cachedMatchingPatchFunctions = this.matchingPatchFunctionsCache.get(scriptData.sourceOriginUrl);
        if (typeof cachedMatchingPatchFunctions != "undefined") return cachedMatchingPatchFunctions;

        const testPatchCondition = async (patchCondition: SourcePatchCondition) => {
            if (patchCondition instanceof RegExp) {
                return patchCondition.test(scriptData.sourceOriginUrl);
            }
            if (typeof patchCondition == "string") {
                return scriptData.sourceOriginUrl.includes(patchCondition);
            }
            if (typeof patchCondition == "function") {
                return await patchCondition(this, scriptData);
            };
        };

        const testedPatchFunctions = await Promise.all(
            this.patchFunctions
                .filter(([_patchCondition, patchFunction]) => {
                    return !options.exceptPatchFunctions.includes(patchFunction);
                })
                .map(
                    async ([patchCondition, patchFunction]) => ({
                        matches: await testPatchCondition(patchCondition),
                        patchFunction: patchFunction,
                    })
                )
        );

        const matchingPatchFunctions = testedPatchFunctions
            .filter(testedPatchFunction => testedPatchFunction.matches)
            .map(testedPatchFunction => testedPatchFunction.patchFunction);

        this.matchingPatchFunctionsCache.set(scriptData.sourceOriginUrl, matchingPatchFunctions);
        return matchingPatchFunctions;
    }

    public async needsPatching(
        scriptData: SourcePatchScriptData,
        options: {
            exceptPatchFunctions: SourcePatchFunction[],
        } = {
            exceptPatchFunctions: [],
        }
    ): Promise<boolean> {
        const matchingPatchFunctions = await this.getMatchingPatchFunctions(scriptData, options);
        return matchingPatchFunctions.length > 0;
    }

    private async getPatchedSource(scriptData: SourcePatchScriptData): Promise<string | null> {
        const matchingPatchFunctions = await this.getMatchingPatchFunctions(scriptData);
        if (matchingPatchFunctions.length == 0) {
            // There is nothing to patch in this source, so tell the patcher to keep using the original script instead.
            return null;
        }

        // Apply all patcher functions to the source (in the same order as the patcher functions were defined).
        for (const patchFunction of matchingPatchFunctions) {
            await patchFunction(this, scriptData);
        }

        return scriptData.source;
    }
}
