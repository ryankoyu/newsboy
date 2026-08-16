import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    css: true,
    /**
     * 15s, up from vitest's 5s default.
     *
     * These are not slow tests — a render-and-click finishes in milliseconds.
     * What costs the time is the jsdom environment each file constructs, and
     * with the suite's files running in parallel that setup contends for the
     * same cores: a full run spends the better part of a minute inside
     * `environment` alone. Under that contention a test can sit waiting for
     * its turn long enough to trip a 5s limit while doing nothing wrong, which
     * is how the suite started failing one arbitrary test per run — a
     * different one each time — with `--no-file-parallelism` passing cleanly.
     *
     * A per-test timeout is meant to catch a hang, not to police scheduling
     * latency on whatever machine happens to be running. 15s still catches a
     * genuine hang quickly; it just stops a busy laptop or a two-core CI
     * runner from being reported as a broken test.
     */
    testTimeout: 15_000,
  },
});
