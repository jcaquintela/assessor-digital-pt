import { useState } from "react";
import { cn } from "@/lib/utils";
import { BRAND_NAME } from "@/lib/brand";

/**
 * Monograma do Afonso com fallback: se a imagem não carregar (rede lenta,
 * cache limpa, offline), mostra o "A" dourado sobre azul-marinho da marca.
 */
export function BrandMark({
  className,
  size = 36,
}: {
  className?: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        role="img"
        aria-label={BRAND_NAME}
        className={cn(
          "flex shrink-0 items-center justify-center rounded-xl font-medium",
          className,
        )}
        style={{
          width: size,
          height: size,
          background: "#132447",
          color: "#e9c46a",
          fontSize: Math.round(size * 0.5),
          lineHeight: 1,
        }}
      >
        A
      </div>
    );
  }

  return (
    <img
      src="/icon-192.png"
      alt={BRAND_NAME}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={cn("shrink-0 rounded-xl object-cover", className)}
      style={{ width: size, height: size }}
    />
  );
}
