import { ImageResponse } from "next/og";

export const alt = "S3 Dock — S3, finally usable.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "#0a0a0a",
          color: "white",
        }}
      >
        <div style={{ fontSize: 88, fontWeight: 700, letterSpacing: "-0.03em" }}>
          S3, finally usable.
        </div>
        <div style={{ marginTop: 28, fontSize: 36, color: "#a1a1aa" }}>
          A modern web UI for S3, R2, MinIO, and anything that speaks the protocol.
        </div>
        <div style={{ marginTop: 56, fontSize: 30, color: "#f59e0b" }}>
          s3dock.app
        </div>
      </div>
    ),
    { ...size }
  );
}
