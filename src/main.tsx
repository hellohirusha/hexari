import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Hexari from "./hexari/App";
import Companion from "./hexari/Companion";
import Forge from "./forge/Forge";
import { resolveSiteRoute } from "./shared/siteRouting";
import "./shared/style.css";
import "./shared/design.css";

const route = resolveSiteRoute(window.location);

if (route.surface === "forge") {
  const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (icon) icon.href = "/forge-icon.svg";
  document.title = "Forge - Hex Strategy Game";
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {route.surface === "forge" ? (
      <Forge />
    ) : route.surface === "tools" ? (
      <Companion />
    ) : (
      <Hexari />
    )}
  </StrictMode>,
);
