import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Forge from "../../src/forge/Forge";
import "../../src/shared/style.css";
import "../../src/shared/design.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Forge standalone />
  </StrictMode>,
);
