import ChessLoader from "@/components/loader/Loader1";

export default function Loader({
  message = "Loading...",
  progress,
}: {
  message?: string;
  progress?: number;
}) {
  return (
    <div
      className="flex-center"
      style={{ flexDirection: "column", gap: "20px", padding: "48px 16px" }}
    >
      <ChessLoader size={48} steps={6} />
      <div style={{ textAlign: "center", width: "300px", maxWidth: "90vw" }}>
        <p style={{ color: "var(--text-secondary)", fontSize: "14px", margin: "0 0 14px" }}>
          {message}
        </p>
        {progress !== undefined && (
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "6px",
              }}
            >
              <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                Stockfish engine
              </span>
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: "700",
                  color: "var(--accent-color)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {Math.round(progress)}%
              </span>
            </div>
            <div
              style={{
                height: "4px",
                borderRadius: "2px",
                background: "var(--surface-2, rgba(255,255,255,0.08))",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: "100%",
                  background:
                    "linear-gradient(90deg, var(--accent-color, #1dc189), #6366f1)",
                  borderRadius: "2px",
                  transform: `scaleX(${progress / 100})`,
                  transformOrigin: "left",
                  transition: "transform 0.25s ease",
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
