import { assert, test } from "vitest";
import { MassReplacer } from "./mass_replacer";

test(
    "multipleReplacementsGetAppliedCorrectly",
    () => {
        const output = new MassReplacer("abc def ghi")
            .replaceSubstring("abc", "foobar")
            .replaceSubstring("ghi", "fizz")
            .replaceSubstring("def", "boofar")
            .apply();

        console.log(output);
        assert(output == "foobar boofar fizz");
    }
);
