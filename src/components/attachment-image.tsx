"use client";

import Image from "next/image";
import { useState } from "react";

type AttachmentImageProps = {
  src: string;
  alt: string;
  variant?: "card" | "detail";
};

export function AttachmentImage({ src, alt, variant = "card" }: AttachmentImageProps) {
  const [useOriginal, setUseOriginal] = useState(false);
  const heightClass = variant === "detail" ? "h-80" : "h-40";
  const sizes = variant === "detail"
    ? "(max-width: 768px) 92vw, 720px"
    : "(max-width: 768px) 92vw, (max-width: 1280px) 42vw, 360px";

  return (
    <span className={`relative block w-full overflow-hidden rounded-md bg-surface ${heightClass}`}>
      {useOriginal ? (
        // Cloudflare Images stops creating new transformations after the free
        // allowance is exhausted. Keep the original R2-backed image usable.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} className="h-full w-full object-contain" loading="lazy" />
      ) : (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          className="object-contain"
          onError={() => setUseOriginal(true)}
        />
      )}
    </span>
  );
}
