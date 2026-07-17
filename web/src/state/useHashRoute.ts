import { useEffect, useState } from "react";

export interface Route {
  runId: string | null;
}

function parse(): Route {
  const m = window.location.hash.match(/^#\/run\/([\w-]+)/);
  return { runId: m ? m[1] : null };
}

export function navigateToRun(id: string): void {
  window.location.hash = `#/run/${id}`;
}

export function navigateHome(): void {
  window.location.hash = "#/";
}

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(parse);
  useEffect(() => {
    const onChange = () => setRoute(parse());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
