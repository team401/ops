"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type Theme = "light" | "dark";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light"),
    );
    return () => cancelAnimationFrame(frame);
  }, []);

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("team401-theme", next);
    setTheme(next);
  }

  return (
    <button
      type="button"
      className="theme-toggle-control flex min-h-9 min-w-9 items-center justify-center rounded border border-steel-line bg-paper-raised text-steel hover:border-blueprint hover:text-blueprint"
      onClick={toggleTheme}
      aria-label={`Use ${theme === "dark" ? "light" : "dark"} mode`}
      title={`Use ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
