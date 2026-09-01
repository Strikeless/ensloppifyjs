import * as acorn from "acorn";
import * as acorn_walk from "acorn-walk";
import { evaluate as eval_estree_expression, variables as eval_estree_expression_variables } from "eval-estree-expression";
import { SourcePatchScriptData } from "../data";
import { SourceDownloadCallback } from "./module";

export type FoundImport = {
    resolvedSourceUrl: string,
    sourceValue: string,
    sourceValueStartIndex: number,
    sourceValueEndIndex: number,
};

export async function findImportsRecursive(
    scriptData: SourcePatchScriptData,
    importedSourceDownloadCallback: SourceDownloadCallback,
    dontRecurseIntoUrls: string[] = [],
): Promise<FoundImport[]> {
    const foundImportsAtRoot = findImports(scriptData);
    const foundImports: FoundImport[] = [];

    const handleImport = async (foundImport: FoundImport) => {
        foundImports.push(foundImport);

        const importedScriptSource = await importedSourceDownloadCallback(foundImport.resolvedSourceUrl);
        const importedScriptData = new SourcePatchScriptData(importedScriptSource, foundImport.resolvedSourceUrl);

        const recursivelyFoundImports = await findImportsRecursive(
            importedScriptData,
            importedSourceDownloadCallback,
            // Do not recurse into any "ancestor" script, as this could lead to infinite recursion.
            // (So if A.js imports B.js which imports C.js, this prevents C.js from recursing into B.js or A.js, even if either of them is imported for some reason)
            dontRecurseIntoUrls.concat(foundImport.resolvedSourceUrl),
        );

        foundImports.push(...recursivelyFoundImports);
    };

    await Promise.all(
        foundImportsAtRoot
            .filter(foundImport => !dontRecurseIntoUrls.includes(foundImport.resolvedSourceUrl))
            .map(foundImport => handleImport(foundImport))
    );

    return foundImports;
}

export function findImports(scriptData: SourcePatchScriptData): FoundImport[] {
    const scriptAst = scriptData.parseAstIfOutdated();
    const foundImports: FoundImport[] = [];

    const handleImportSourceNode = (sourceNode: acorn.Node) => {
        // https://github.com/jonschlinkert/eval-estree-expression#variables
        const sourceExpressionVariables = eval_estree_expression_variables(sourceNode);
        if (sourceExpressionVariables.length > 0) throw new Error("TODO: Import source expression uses variables, this is not yet supported.");

        // https://github.com/jonschlinkert/eval-estree-expression#evaluatesync
        const sourceValueAny: any = eval_estree_expression.sync(
            sourceNode,
            {}, // Context object with variables
            {
                // https://github.com/jonschlinkert/eval-estree-expression#options
                functions: false, // Unsafe function evaluation
                strict: true,
            }
        );

        const sourceValue = sourceValueAny.toString();
        const resolvedSourceUrl = resolveImportSourceUrl(sourceValue, scriptData);

        if (resolvedSourceUrl == null) {
            // The import's source URL couldn't be resolved. Nothing we can do here.
            return;
        }

        foundImports.push({
            resolvedSourceUrl,
            sourceValue,
            sourceValueStartIndex: sourceNode.start,
            sourceValueEndIndex: sourceNode.end,
        });
    };

    acorn_walk.simple(
        scriptAst,
        {
            ImportExpression(node) {
                handleImportSourceNode(node.source);
            },
            ImportDeclaration(node) {
                handleImportSourceNode(node.source);
            },
        }
    )

    return foundImports;
}

export function resolveImportSourceUrl(
    importSourceValue: string,
    importerScriptData: SourcePatchScriptData,
): string | null {
    // TODO: This is an extremely naive implementation that doesn't take into account import maps and probably lacks some other detail too.
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/import
    // https://html.spec.whatwg.org/multipage/webappapis.html#resolve-a-module-specifier
    try {
        return new URL(importSourceValue, importerScriptData.sourceOriginUrl).href;
    } catch {
        return null;
    }
}
