export function campaignCaseHref(runId: string, caseId: string) {
  return `/campaigns/${encodeURIComponent(runId)}/seeds/${encodeURIComponent(caseId)}`;
}

export function decodeCaseRouteParam(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function caseDisplay(value: string) {
  const [baseId, generatedKind] = value.split("::", 2);
  if (generatedKind?.startsWith("adaptive-")) {
    return {
      prefix: "adaptive",
      primary: generatedKind.replace(/^adaptive-/, ""),
      secondary: `base ${stripSeedPrefix(baseId)}`
    };
  }
  if (generatedKind) {
    return {
      prefix: "generated",
      primary: generatedKind,
      secondary: `base ${stripSeedPrefix(baseId)}`
    };
  }
  return {
    prefix: "seed",
    primary: stripSeedPrefix(value),
    secondary: undefined
  };
}

function stripSeedPrefix(value: string) {
  return value.replace(/^seed_/, "");
}
