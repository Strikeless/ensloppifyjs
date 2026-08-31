import { assert, test } from "vitest";
import { SourcePatcher, SourcePatchImplementation } from "./lib";

test(
    "basicScriptPatchGetsApplied",
    async () => {
        const originalScript = `
            (
                () => {
                    console.log("Hello, world!");
                    return false;
                }
            )();
        `;

        const patch: SourcePatchImplementation = [
            (..._patchConditionArgs) => {
                return true;
            },
            (_sourcePatcher, scriptData) => {
                scriptData.source = `
                    (
                        () => {
                            console.log("Hello, ensloppifyjs!");
                            return true;
                        }
                    )();
                `;
            },
        ];

        const sourcePatcher = new SourcePatcher([patch]);
        const patchedScriptBlobUrl = await sourcePatcher.patchToBlobUrl(originalScript, new URL("https://example.com/"));

        const patchedScriptSource = await (await fetch(patchedScriptBlobUrl)).text();
        const evalResult = eval(patchedScriptSource);
        assert(evalResult, `Patched version didn't run, evaluated ${evalResult}`);
    }
);
