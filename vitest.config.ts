import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/world/**/*.test.ts", "src/client/presentation.test.ts"]
  }
});
