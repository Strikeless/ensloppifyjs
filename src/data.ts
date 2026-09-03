import * as acorn from "acorn";
import * as acorn_loose from "acorn-loose";
import { SourceDownloadCallback } from "./patcher";

export type SourceType = "module" | "script" | "commonjs";

export type SourcePatchScriptDataKey = string | HTMLScriptElement;

export class SourcePatchScriptData {
    private static CLEAN_SOURCE_AST_CACHE: Map<SourcePatchScriptDataKey, acorn.Program> | null = null;

    private _key: SourcePatchScriptDataKey;
    private _source: string;
    private _sourceType: SourceType;
    private _sourceOriginCanonicalUrl: string;
    private _isSourceClean = true;
    private _ast: acorn.Program | null = null;
    private _isAstOutdated = true;

    /**
     * A key that can identify a {@link SourcePatchScriptData} by the unique script it refers to.
     * 
     * This must compare equal in two {@link SourcePatchScriptData} instances that point to the same script.
     */
    public get key(): SourcePatchScriptDataKey { return this._key; }
    /**
     * The source code of this script. Patcher functions should apply their changes here.
     * 
     * NOTE: To avoid unnecessary string comparison, setting this value will mark the source dirty ({@link isSourceClean} == `false`)
     * and the AST outdated ({@link isAstOutdated}), regardless of whether the value actually changed at all.
     */
    public get source(): string { return this._source; }
    public get sourceType(): SourceType { return this._sourceType; }
    /**
     * The canonical/absolute URL from where this script originates from.
     * This value should correspond to that of `import.meta.url` as called from this script.
     * 
     * In the case of a script whose source is embedded into a HTML document, this refers to the URL of the HTML document;
     * As such, this must not be used distinguishing scripts from each other, as there may be ambiquity across scripts;
     * Use {@link key} instead, as that can distinguish between scripts embedded into the same document.
     */
    public get sourceOriginCanonicalUrl(): string { return this._sourceOriginCanonicalUrl; }
    /**
     * Whether {@link source} has not had any mutations after this {@link SourcePatchScriptData} was constructed.
     */
    public get isSourceClean(): boolean { return this._isSourceClean; }
    /**
     * The AST of this script as parsed by {@link acorn} or {@link acorn_loose} when {@link parseAstIfOutdated} was last called, or `null` if never parsed.
     */
    public get ast(): acorn.Program | null { return this._ast; }
    /**
     * Whether {@link source} has been mutated since {@link ast} was last parsed by {@link parseAstIfOutdated}.
     */
    public get isAstOutdated(): boolean { return this._isAstOutdated; }

    public set source(value: string) {
        this._source = value;
        this._isSourceClean = false;
        this._isAstOutdated = true;
    }

    /**
     * Enables caching AST parsed from clean sources, for when a new {@link SourcePatchScriptData} is instantiated with the same script origin.
     * 
     * NOTE: This caching behavior assumes that a script origin will always resolve to the same script content.
     * This assumption may not hold in some cases (unit tests, undeterministic server, etc), which is why caching is disabled by default.
     */
    public static enableAstCache() {
        SourcePatchScriptData.CLEAN_SOURCE_AST_CACHE = new Map();
    }

    /**
     * Clears and disables the clean source AST cache. See {@link enableAstCache} for more information.
     */
    public static disableAstCache() {
        SourcePatchScriptData.CLEAN_SOURCE_AST_CACHE = null;
    }

    public static ofModuleSource(source: string, sourceOriginCanonicalUrl: string): SourcePatchScriptData {
        return new SourcePatchScriptData(
            sourceOriginCanonicalUrl,
            source,
            "module",
            sourceOriginCanonicalUrl,
        );
    }

    public static async ofScriptElement(scriptElement: HTMLScriptElement, srcDownloadCallback: SourceDownloadCallback) {
        let scriptSourceOriginCanonicalUrl = scriptElement.src != null
            // The script originates from it's src URL, we just need to resolve that with the element's base URI.
            ? new URL(scriptElement.src, scriptElement.baseURI).href
            // The script is inlined into the document, so it's "origin" is the document.
            : scriptElement.ownerDocument.URL;

        let scriptDataKey: SourcePatchScriptDataKey = scriptElement.src != null
            // This is a script included by a script element, but it is loaded from another origin (is not inlined into the element).
            ? scriptSourceOriginCanonicalUrl
            // This is a script inlined into the script element. Use the script element object itself as a key.
            : scriptElement;

        let scriptSource = scriptElement.src != null
            ? await srcDownloadCallback(scriptSourceOriginCanonicalUrl)
            : scriptElement.textContent;

        let scriptSourceType: SourceType;
        switch (scriptElement.type) {
            case "script": scriptSourceType = "script"; break;
            case "module": scriptSourceType = "module"; break;
            // Let's assume that this is a classic script (very incorrectly, see https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/script/type).
            // This could be a javascript MIME-type (see https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/MIME_types#textjavascript), in which case our assumption would be correct.
            // This could also be data that the browser doesn't interpret as a script, but at that point you probably (hopefully) wouldn't be calling this method. 
            default: scriptSourceType = "script"; break;
        }

        return new SourcePatchScriptData(
            scriptDataKey,
            scriptSource,
            scriptSourceType,
            scriptSourceOriginCanonicalUrl,
        );
    }

    public constructor(
        key: SourcePatchScriptDataKey,
        source: string,
        sourceType: SourceType,
        sourceOriginCanonicalUrl: string,
    ) {
        this._key = key;
        this._source = source;
        this._sourceType = sourceType;
        this._sourceOriginCanonicalUrl = sourceOriginCanonicalUrl;

        // Use cached AST if AST has previously been parsed for this source while clean.
        const cachedAst = SourcePatchScriptData.CLEAN_SOURCE_AST_CACHE?.get(key);
        if (typeof cachedAst != "undefined") {
            this._ast = cachedAst;
            this._isAstOutdated = false;
        }
    }

    /**
     * Parses an AST of {@link source} using {@link acorn} or {@link acorn_loose} if {@link ast} is outdated (including `null`).
     * 
     * The AST can later on be accessed as {@link ast} without reparsing, though you will then have to check {@link isAstOutdated} manually,
     * if you want to make sure that the AST is consistent with the current {@link source}.
     * 
     * @returns the parsed AST, or the previously parsed value in {@link ast} if not outdated.
     */
    public parseAstIfOutdated(): acorn.Program {
        if (!this._isAstOutdated) return this._ast!;

        const acornOptions: acorn.Options = {
            ...acorn.defaultOptions,
            ecmaVersion: "latest",
            sourceType: this.sourceType,
            strict: false,
            allowReturnOutsideFunction: true,
            allowImportExportEverywhere: true,
            allowAwaitOutsideFunction: true,
            allowSuperOutsideMethod: true,
            allowHashBang: true,
            allowReserved: true,
            checkPrivateFields: false,
        };

        try {
            this._ast = acorn.parse(this.source, acornOptions);
        } catch {
            this._ast = acorn_loose.parse(this.source, acornOptions);
        }

        if (this._isSourceClean) {
            // The source in this instance hasn't been modified yet. We can cache the AST, in case a new instance is created for this same script.
            SourcePatchScriptData.CLEAN_SOURCE_AST_CACHE?.set(this._key, this._ast);
        }

        this._isAstOutdated = false;
        return this._ast;
    }
};
