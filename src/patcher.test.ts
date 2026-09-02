import { assert, test } from "vitest";
import { SourcePatcher, SourcePatchImplementation } from "./patcher";
import { SourcePatchScriptData } from "./data";

test(
    "basicScriptPatchGetsApplied",
    async () => {
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

        const scriptData = SourcePatchScriptData.ofModule(
            `
                (
                    () => {
                        console.log("Hello, world!");
                        return false;
                    }
                )();
            `,
            "https://example.com/",
        );

        const sourcePatcher = new SourcePatcher([patch]);
        const patchedScriptBlobUrl = await sourcePatcher.patchDataToBlobUrl(scriptData);
        assert(patchedScriptBlobUrl != null, "No patches applied");

        const patchedScriptSource = await (await fetch(patchedScriptBlobUrl)).text();
        const evalResult = eval(patchedScriptSource);
        assert(evalResult, `Patched version didn't run, evaluated ${evalResult}`);
    }
);
