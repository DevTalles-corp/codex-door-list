"use client";

import Image from "next/image";
import { useState } from "react";
import type { EventCover as EventCoverData } from "@/lib/event-cover-types";

function CoverImage({ cover, title, sizes, loading }: { cover: EventCoverData; title: string; sizes: string; loading: "eager" | "lazy" }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [original, setOriginal] = useState(cover.url.startsWith("blob:"));
  return <>
    <CoverMarker label={failed ? "Portada no disponible" : "Cargando portada"} hidden={loaded} />
    {!failed && <Image key={original ? "original" : "optimized"} src={cover.url} fill sizes={sizes} loading={loading}
      alt={cover.altText || `Portada de ${title}`} unoptimized={original}
      className={`event-cover-image${loaded ? " event-cover-loaded" : ""}`}
      style={{ objectPosition: `${cover.positionX * 100}% ${cover.positionY * 100}%` }}
      onLoad={() => setLoaded(true)} onError={() => {
        setLoaded(false);
        if (!original) setOriginal(true);
        else setFailed(true);
      }} />}
  </>;
}

function CoverMarker({ label, hidden = false }: { label: string; hidden?: boolean }) {
  return <div className="event-cover-marker" aria-hidden={hidden || undefined}>
    <svg aria-hidden="true" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="5" width="26" height="22" rx="3" />
      <circle cx="11" cy="12" r="2" />
      <path d="m4 24 8-8 5 5 4-4 7 7" />
    </svg>
    <span>{label}</span>
  </div>;
}

export default function EventCover({ title, cover, sizes = "(max-width: 700px) calc(100vw - 2rem), (max-width: 1120px) 50vw, 360px", loading = "lazy" }: {
  title: string; cover: EventCoverData | null; sizes?: string; loading?: "eager" | "lazy";
}) {
  return <div className="event-cover">
    {cover ? <CoverImage key={cover.url} cover={cover} title={title} sizes={sizes} loading={loading} /> : <CoverMarker label="Sin portada" />}
  </div>;
}
