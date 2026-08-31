import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
    test: {
        browser: {
            provider: playwright(),
            enabled: true,
            headless: true,
            ui: true,
            instances: [
                { browser: "chromium" },
                { browser: "firefox" },
            ],
        },
    },
});
