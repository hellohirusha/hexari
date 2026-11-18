import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Hexari from "./hexari/App";
import Companion from "./hexari/Companion";
import Forge from "./forge/Forge";
import "./shared/style.css";
import "./shared/design.css";

if (location.pathname.startsWith("/forge")) {
  const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (icon) icon.href = "/forge-icon.svg";
  document.title = "Forge - Hex Strategy Game";
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {location.pathname.startsWith("/forge") ? (
      <Forge />
    ) : location.pathname.startsWith("/tools") ? (
      <Companion />
    ) : (
      <Hexari />
    )}
  </StrictMode>,
);
