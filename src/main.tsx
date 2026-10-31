import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { App } from "./App";
import { bundledDataSource } from "./data/bundledDataSource";
import { ModePalettePrototype } from "./ui/ModePalettePrototype";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing #root element");
}

createRoot(rootElement).render(
  <StrictMode>
    <App source={bundledDataSource} />
    {import.meta.env.DEV && <ModePalettePrototype />}
  </StrictMode>,
);
