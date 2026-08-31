import type { ComponentProps } from "react";

import { cn } from "@token-boat/ui/lib/utils";

const tokenBoatLogoUrl = `${import.meta.env.BASE_URL}brand/token-boat-logo-512.png`;

type BrandMarkProps = Omit<ComponentProps<"img">, "alt" | "src"> & {
  alt?: string;
};

export function BrandMark({ alt = "", className, ...props }: BrandMarkProps) {
  return (
    <img
      alt={alt}
      className={cn("shrink-0 object-contain", className)}
      decoding="async"
      draggable={false}
      height={512}
      src={tokenBoatLogoUrl}
      width={512}
      {...props}
    />
  );
}
