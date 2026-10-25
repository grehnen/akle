import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import { App } from "./App";
import { bundledDataSource } from "./data/bundledDataSource";
// PROTOTYPE (F): `?telefon=1` on /resplan frames the page at 390 px. Never merge to main.
import { PhoneFramePage, wantsPhoneFrame } from "./ui/ItineraryBuilderPrototype";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing #root element");
}

createRoot(rootElement).render(
  <StrictMode>
    {wantsPhoneFrame() ? <PhoneFramePage /> : <App source={bundledDataSource} />}
  </StrictMode>,
);
