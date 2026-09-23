import { createContext, useContext } from "react";

export const ShellBodyContext = createContext<HTMLElement | null>(null);

export function useShellBody() {
  return useContext(ShellBodyContext);
}
