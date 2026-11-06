import { Util } from "..";

export class MassReplacer {
    private haystack: string;
    private replacements: MassReplacerReplacement[] = [];

    public constructor(haystack: string) {
        this.haystack = haystack;
    }

    public replaceRange(startIndex: number, endIndex: number, replacement: string): MassReplacer {
        this.replacements.push(new MassReplacerReplacement(startIndex, endIndex, replacement));
        return this;
    }

    public replaceSubstring(from: string, to: string): MassReplacer {
        let fromSubstringStartIndex = this.haystack.indexOf(from);

        while (fromSubstringStartIndex !== -1) {
            let fromSubstringEndIndex = fromSubstringStartIndex + from.length;
            this.replacements.push(new MassReplacerReplacement(fromSubstringStartIndex, fromSubstringEndIndex, to));

            fromSubstringStartIndex = this.haystack.indexOf(from, fromSubstringStartIndex + 1);
        }

        return this;
    }

    public apply(): string {
        let output = this.haystack;

        // Sort replacements from last-to-first index, so that indices of latter replacements do not get affected by earlier replacements.
        // TODO: We should verify that there are no overlapping replacements, since those just can't work in a sensible way, and probably don't make sense in the first place.
        this.replacements.sort((a, b) => b.startIndex - a.startIndex);

        for (const replacement of this.replacements) {
            output = Util.stringReplaceAtBounds(
                output,
                replacement.startIndex,
                replacement.endIndex,
                replacement.replacement,
            );
        }

        return output;
    }
}

class MassReplacerReplacement {
    public startIndex: number;
    public endIndex: number;
    public replacement: string;

    public constructor(startIndex: number, endIndex: number, replacement: string) {
        this.startIndex = startIndex;
        this.endIndex = endIndex;
        this.replacement = replacement;
    }
}
