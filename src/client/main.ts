export {};

const params = new URLSearchParams(location.search);

if (params.get("spc") === "1") {
  if (params.get("presentation-ack") === "1" && params.get("evidence") === "1") {
    await import("./spc-next-presentation-ack-instrumentation");
  }
  await import("./spc-next-research-app");
} else {
  await import("./legacy-main");
}
