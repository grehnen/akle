import { createContext, useContext } from "react";

/**
 * Opens another page of the app in place, through the History API, so Back returns. Outside the
 * app, as for a component rendered on its own, it loads the page instead.
 */
export type Navigate = (to: string) => void;

export const NavigateContext = createContext<Navigate>((to) => globalThis.location.assign(to));

export const useNavigate = (): Navigate => useContext(NavigateContext);
