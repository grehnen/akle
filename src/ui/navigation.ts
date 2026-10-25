import { createContext, useContext } from "react";

/** How the app moves between its pages, and how the page shown was reached. */
export type Navigation = {
  /**
   * Opens another page of the app in place, through the History API, so Back returns. Outside
   * the app, as for a component rendered on its own, it loads the page instead.
   */
  navigate: (to: string) => void;
  /**
   * Whether this page was reached by a link within the app, such as a Fortsätt link, rather than
   * by loading it or by Back and Forward: a trip it opens on goes on the board as if by the
   * player's own action.
   */
  arrivedInApp: boolean;
};

export const NavigationContext = createContext<Navigation>({
  navigate: (to) => globalThis.location.assign(to),
  arrivedInApp: false,
});

export const useNavigation = (): Navigation => useContext(NavigationContext);
