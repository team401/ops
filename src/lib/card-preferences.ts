export type CardDefault = "collapsed" | "expanded";

export const CARD_DEFAULT_KEY = "team401-ops-card-default";

export function getCardDefault(): CardDefault {
  if (typeof window === "undefined") return "collapsed";
  return localStorage.getItem(CARD_DEFAULT_KEY) === "expanded" ? "expanded" : "collapsed";
}

export function setCardDefault(value: CardDefault) {
  localStorage.setItem(CARD_DEFAULT_KEY, value);
  window.dispatchEvent(new CustomEvent("ops-card-default-change", { detail: value }));
}

export function subscribeCardDefault(listener: () => void) {
  const handleChange = () => listener();
  window.addEventListener("ops-card-default-change", handleChange);
  window.addEventListener("storage", handleChange);
  return () => {
    window.removeEventListener("ops-card-default-change", handleChange);
    window.removeEventListener("storage", handleChange);
  };
}
