"use client";

import { useEffect, useState } from "react";

// Resolve copied references to the environment the developer is actually viewing.
export function useBazaarOrigin() {
  const [origin, setOrigin] = useState("https://bazaar.browns.studio");
  useEffect(() => {
    if (["https:", "http:"].includes(window.location.protocol)) {
      setOrigin(window.location.origin);
    }
  }, []);
  return origin;
}
