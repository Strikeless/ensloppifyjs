import { SourcePatchScriptData, SourcePatchScriptDataKey, SourceType } from "./data";

export type SourcePatchCondition = string
    | RegExp
    | ((scriptData: SourcePatchScriptData, sourcePatcher: SourcePatcher) => boolean | Promise<boolean>);
export type SourcePatchFunction = (scriptData: SourcePatchScriptData, sourcePatcher: SourcePatcher) => void | Promise<void>;
export type SourcePatchImplementation = [SourcePatchCondition, SourcePatchFunction];

export type SourceDownloadCallback = (sourceOriginUrl: string) => string | Promise<string>;

export class SourcePatcher {
    private patchImplementations: SourcePatchImplementation[];
    private patchedBlobUrls: Map<SourcePatchScriptDataKey, URL | null> = new Map();
    private matchingPatchFunctionsCache: Map<SourcePatchScriptDataKey, SourcePatchFunction[]> = new Map();

    constructor(patchImplementations: SourcePatchImplementation[]) {
        this.patchImplementations = patchImplementations;
    }

    public async patchScriptElementToBlobUrl(
        scriptElement: HTMLScriptElement,
        srcDownloadCallback: SourceDownloadCallback,
    ): Promise<URL | null> {
        const scriptData = await SourcePatchScriptData.ofScriptElement(scriptElement, srcDownloadCallback);
        return await this.patchDataToBlobUrl(scriptData);
    }

    public async patchDataToBlobUrl(scriptData: SourcePatchScriptData): Promise<URL | null> {
        const alreadyPatchedScriptBlobUrl = this.patchedBlobUrls.get(scriptData.key);
        switch (alreadyPatchedScriptBlobUrl) {
            // This script has not yet been patched.
            case undefined: break;
            // This script has already been checked and does not require any patching/fixing.
            case null: return null;
            // This script has already been checked and patched. Return the blob URL to the patched script.
            default: return alreadyPatchedScriptBlobUrl;
        }

        const newlyPatchedScriptSource = await this.getPatchedSource(scriptData);

        if (newlyPatchedScriptSource == null) {
            // This script didn't require any patching. Just cache the result and move on.
            this.patchedBlobUrls.set(scriptData.key, null);
            return null;
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
        this.patchedBlobUrls.set(scriptData.key, newlyPatchedScriptBlobUrl);

        return newlyPatchedScriptBlobUrl;
    }

    public revokePatchedBlobUrls() {
        for (const patchedScriptBlobUrl of this.patchedBlobUrls.values()) {
            if (patchedScriptBlobUrl == null) {
                // This script didn't need any patching/fixing, so there's no blob URL to a patched version.
                continue;
            }

            URL.revokeObjectURL(patchedScriptBlobUrl.href);
        }

        // Now that all the blob URLs to the patched scripts have been revoked, there's no need to hold onto these now unusable URLs.
        // Clear the map to make sure that we don't keep using these now unusable URLs if more scripts are patched with this instance.
        this.patchedBlobUrls.clear();
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

    public async getMatchingPatchFunctions(
        scriptData: SourcePatchScriptData,
        options: {
            exceptPatchFunctions: SourcePatchFunction[],
        } = {
            exceptPatchFunctions: [],
        }
    ): Promise<SourcePatchFunction[]> {
        const allMatchingPatchFunctions = await this.getAllMatchingPatchFunctions(scriptData);

        return allMatchingPatchFunctions
            .filter(patchFunction => !options.exceptPatchFunctions.includes(patchFunction));
    }

    private async getAllMatchingPatchFunctions(scriptData: SourcePatchScriptData) {
        // See if we've already tested for matching patch functions and use past results if we have.
        // This must be cached since function patch conditions could A) be slow, and B) be non-deterministic, which would cause bugs without caching.
        // The core API by itself only checks matching patch functions once, but patch conditions are allowed to test for other matching patch conditions.
        const cachedMatchingPatchFunctions = this.matchingPatchFunctionsCache.get(scriptData.key);
        if (typeof cachedMatchingPatchFunctions != "undefined") return cachedMatchingPatchFunctions;

        const testPatchCondition = async (patchCondition: SourcePatchCondition) => {
            if (patchCondition instanceof RegExp) {
                return patchCondition.test(scriptData.sourceOriginCanonicalUrl);
            }
            if (typeof patchCondition == "string") {
                return scriptData.sourceOriginCanonicalUrl.includes(patchCondition);
            }
            if (typeof patchCondition == "function") {
                return await patchCondition(scriptData, this);
            };
        };

        const testedPatchFunctions = await Promise.all(
            this.patchImplementations
                .map(
                    async ([patchCondition, patchFunction]) => ({
                        patchConditionMatches: await testPatchCondition(patchCondition),
                        patchFunction: patchFunction,
                    })
                )
        );

        const matchingPatchFunctions = testedPatchFunctions
            .filter(testedPatchFunction => testedPatchFunction.patchConditionMatches)
            .map(testedPatchFunction => testedPatchFunction.patchFunction);

        this.matchingPatchFunctionsCache.set(scriptData.key, matchingPatchFunctions);
        return matchingPatchFunctions;
    }

    private async getPatchedSource(scriptData: SourcePatchScriptData): Promise<string | null> {
        const matchingPatchFunctions = await this.getMatchingPatchFunctions(scriptData);
        if (matchingPatchFunctions.length == 0) {
            // There is nothing to patch in this source, so tell the patcher to keep using the original script instead.
            return null;
        }

        // Apply all patcher functions to the source (in the same order as the patcher functions were defined).
        for (const patchFunction of matchingPatchFunctions) {
            await patchFunction(scriptData, this);
        }

        return scriptData.source;
    }
}
