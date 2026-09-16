export type ReviewOriginPlan = {
  canonicalUrl: string;
  legacyRecoveryUrl: string | null;
  recoveryOrigin: boolean;
  shouldRedirect: boolean;
};

export function reviewOriginPlan(rawUrl: string): ReviewOriginPlan {
  const current = new URL(rawUrl);
  const isLoopback = current.hostname === "127.0.0.1" || current.hostname === "[::1]";
  const recoveryOptIn = current.searchParams.get("originRecovery") === "1";
  const canonical = new URL(current);
  canonical.hostname = "localhost";
  canonical.searchParams.delete("originRecovery");

  let legacyRecoveryUrl: string | null = null;
  if (current.hostname === "localhost") {
    const legacy = new URL(current);
    legacy.hostname = "127.0.0.1";
    legacy.searchParams.set("originRecovery", "1");
    legacyRecoveryUrl = legacy.toString();
  }

  return {
    canonicalUrl: canonical.toString(),
    legacyRecoveryUrl,
    recoveryOrigin: isLoopback && recoveryOptIn,
    shouldRedirect: isLoopback && !recoveryOptIn,
  };
}
