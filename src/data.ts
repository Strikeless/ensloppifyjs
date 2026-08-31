import * as acorn from "acorn";
import * as acorn_loose from "acorn-loose";

export class SourcePatchScriptData {
    private static CLEAN_SOURCE_AST_CACHE: Map<string, acorn.Program> = new Map();

    private _source: string;
    /** The source code of this script. */
    public get source(): string {
        return this._source;
    }
    public set source(value: string) {
        this._source = value;
        this._isAstOutdated = true;
        this._isSourceClean = false;
    }

    private _sourceOriginUrl: string;
    /** The canonical/absolute URL from where this script originates from. */
    public get sourceOriginUrl(): string { return this._sourceOriginUrl; }

    private _isSourceClean = true;
    /** Whether {@link source} has not had any mutations after this {@link SourcePatchScriptData} was constructed. */
    public get isSourceClean(): boolean { return this._isSourceClean; }

    private _ast: acorn.Program | null = null;
    /** The AST of this script as parsed by {@link acorn} or {@link acorn_loose} when {@link parseAstIfOutdated} was last called, or `null` if never parsed. */
    public get ast(): acorn.Program | null { return this._ast; }

    private _isAstOutdated = true;
    /** Whether {@link source} has been mutated since {@link ast} was last parsed by {@link parseAstIfOutdated}. */
    public get isAstOutdated(): boolean { return this._isAstOutdated; }

    public constructor(source: string, sourceOriginCanonicalUrl: string) {
        this._source = source;
        this._sourceOriginUrl = sourceOriginCanonicalUrl;

        // Use cached AST if AST has previously been parsed for this source while clean.
        const cachedAst = SourcePatchScriptData.CLEAN_SOURCE_AST_CACHE.get(sourceOriginCanonicalUrl);
        if (typeof cachedAst != "undefined") this._ast = cachedAst;
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

        const ACORN_OPTIONS: acorn.Options = {
            ...acorn.defaultOptions,
            ecmaVersion: "latest",
            sourceType: "module",
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
            this._ast = acorn.parse(this.source, ACORN_OPTIONS);
        } catch {
            this._ast = acorn_loose.parse(this.source, ACORN_OPTIONS);
        }

        if (this._isSourceClean) {
            // The source in this instance hasn't been modified yet. We can cache the AST, in case a new instance is created for this same script.
            SourcePatchScriptData.CLEAN_SOURCE_AST_CACHE.set(this._sourceOriginUrl, this._ast);
        }

        this._isAstOutdated = false;
        return this._ast;
    }
};
