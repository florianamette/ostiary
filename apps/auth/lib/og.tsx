import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

import { brand } from "@ostiary/core/lib/brand";
import { logoMarkDataUri } from "@ostiary/core/lib/brand-image";

/**
 * Open Graph / Twitter card: an ink ground with an open doorway on the right, brass
 * light spilling through its keyhole; Instrument Sans with the accent words in
 * Instrument Serif italic. Fonts are vendored in `assets/fonts` (Satori can't use
 * next/font); the app runs from apps/auth, so they resolve from there.
 */
export const ogSize = { width: 1200, height: 630 };

const font = (file: string) => readFile(join(process.cwd(), "assets/fonts", file));
const fontsPromise = Promise.all([
  font("InstrumentSans-Regular.ttf"),
  font("InstrumentSans-SemiBold.ttf"),
  font("InstrumentSerif-Italic.ttf"),
]);

/** The doorway: the mark's arch at poster scale, a glow inside and the keyhole lit. */
function doorwayDataUri() {
  const c = brand.colors;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="630" viewBox="0 0 420 630">
  <defs>
    <radialGradient id="glow" cx="50%" cy="58%" r="60%">
      <stop offset="0" stop-color="${c.brass}" stop-opacity="0.38"/>
      <stop offset="0.55" stop-color="${c.brass}" stop-opacity="0.08"/>
      <stop offset="1" stop-color="${c.brass}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="edge" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${c.brass}" stop-opacity="0.9"/>
      <stop offset="1" stop-color="${c.brass}" stop-opacity="0.15"/>
    </linearGradient>
  </defs>
  <path d="M40 630V250a170 170 0 0 1 340 0v380Z" fill="url(#glow)"/>
  <path d="M40 630V250a170 170 0 0 1 340 0v380" fill="none" stroke="url(#edge)" stroke-width="2"/>
  <path d="M84 630V258a126 126 0 0 1 252 0v372" fill="none" stroke="${c.brass}" stroke-opacity="0.22" stroke-width="1.5"/>
  <path d="M210 296a32 32 0 0 1 15 60.2L233 410h-46l8-53.8A32 32 0 0 1 210 296Z" fill="${c.brass}"/>
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

/** Splits the title around the accent words so they can be set in the serif italic. */
function splitAccent(title: string, accent: string) {
  const at = accent ? title.indexOf(accent) : -1;
  if (at < 0) return [title, "", ""] as const;
  return [title.slice(0, at), accent, title.slice(at + accent.length)] as const;
}

export async function renderOgImage({ title, description, host }: { title: string; description: string; host: string }) {
  const [regular, semibold, serifItalic] = await fontsPromise;
  const c = brand.colors;
  const [before, accent, after] = splitAccent(title, brand.taglineAccent);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          background: c.night,
          backgroundImage: `radial-gradient(900px 500px at 85% 70%, rgba(212,161,58,0.10), transparent)`,
          color: c.nightBody,
          fontFamily: "Instrument Sans",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={doorwayDataUri()} width={420} height={630} alt="" style={{ position: "absolute", right: 48, top: 0 }} />

        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, width: 800 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoMarkDataUri({ size: 56 })} width={56} height={56} alt="" />
            <span style={{ fontSize: 34, fontWeight: 600, letterSpacing: -0.8 }}>{brand.name}</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
            <div style={{ display: "flex", flexWrap: "wrap", fontSize: 76, fontWeight: 600, lineHeight: 1.04, letterSpacing: -2.6 }}>
              {before ? <span style={{ whiteSpace: "pre" }}>{before}</span> : null}
              {accent ? (
                <span style={{ fontFamily: "Instrument Serif", fontStyle: "italic", fontWeight: 400, color: c.brass, letterSpacing: -1, whiteSpace: "pre" }}>
                  {accent}
                </span>
              ) : null}
              {after ? <span style={{ whiteSpace: "pre" }}>{after}</span> : null}
            </div>
            <div style={{ display: "block", fontSize: 28, lineHeight: 1.4, color: c.nightText, maxWidth: 620 }}>{description}</div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 22, color: c.nightText }}>
            <span style={{ display: "flex", width: 8, height: 8, borderRadius: 999, background: c.brass }} />
            <span>{host}</span>
          </div>
        </div>
      </div>
    ),
    {
      ...ogSize,
      fonts: [
        { name: "Instrument Sans", data: regular, weight: 400, style: "normal" },
        { name: "Instrument Sans", data: semibold, weight: 600, style: "normal" },
        { name: "Instrument Serif", data: serifItalic, weight: 400, style: "italic" },
      ],
    },
  );
}
