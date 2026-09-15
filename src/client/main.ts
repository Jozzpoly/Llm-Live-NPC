const params = new URLSearchParams(location.search);

if (params.get("spc") === "1") {
  await import("./spc-next-research-app");
} else {
  await import("./legacy-main");
}
