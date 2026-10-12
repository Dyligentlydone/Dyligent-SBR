"use client";

import { useEffect, useState } from "react";

const PHRASES = [
  "actually personable.",
  "entirely leak-proof.",
  "always on the clock.",
  "instantly responsive.",
  "completely hands-free.",
];

export function RotatingHeadline() {
  const [i, setI] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % PHRASES.length), 2600);
    return () => clearInterval(t);
  }, []);

  return (
    <h1 className="whitespace-nowrap text-3xl font-bold tracking-tight sm:text-4xl">
      Your pipeline,{" "}
      <span
        key={i}
        className="inline-block min-w-[20ch] animate-[headline-in_0.45s_ease-out] text-left text-brand-700"
      >
        {PHRASES[i]}
      </span>
    </h1>
  );
}
