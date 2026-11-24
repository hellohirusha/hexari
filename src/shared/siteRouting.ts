export type SiteSurface = "forge" | "tools" | "hexari";

type SiteLocation = Pick<Location, "hostname" | "pathname">;

export function resolveSiteRoute(location: SiteLocation): {
  surface: SiteSurface;
} {
  const hostname = location.hostname.toLowerCase();
  const isForgePath =
    location.pathname === "/forge" || location.pathname.startsWith("/forge/");

  if (hostname === "forge.hirusha.space" || isForgePath)
    return { surface: "forge" };
  if (location.pathname.startsWith("/tools")) return { surface: "tools" };
  return { surface: "hexari" };
}
