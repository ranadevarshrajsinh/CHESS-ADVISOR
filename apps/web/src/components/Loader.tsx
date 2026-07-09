import ChessLoader from "@/components/loader/Loader1";

export default function Loader({ message = "Loading..." }: { message?: string }) {
  return (
    <div
      className="flex-center"
      style={{ flexDirection: "column", gap: "20px", padding: "48px 16px" }}
    >
      <ChessLoader size={48} steps={6} />
      <p style={{ color: "var(--text-secondary)", fontSize: "14px", margin: 0 }}>
        {message}
      </p>
    </div>
  );
}
