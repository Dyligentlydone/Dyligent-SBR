import Image from "next/image";

// Brand lockup: {Dyligent.} wordmark + "SDR" text.
export function Logo({ height = 22 }: { height?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {/* wordmark aspect ratio ≈ 4.39:1 (927×211 source) */}
      <Image src="/logo.png" alt="Dyligent" width={Math.round(height * 4.39)} height={height} priority />
      <span className="text-sm font-semibold uppercase tracking-widest text-teal-700">SDR</span>
    </span>
  );
}
