export {};

const params = new URLSearchParams(location.search);

if (params.get("spc") === "1") {
  if (params.get("geometry-ack") === "1" && params.get("evidence") === "1") {
    await import("./spc-next-presentation-geometry-ack-instrumentation");
  }
  await import("./spc-next-research-app");
} else {
  await import("./legacy-main");
}
