export default function BrandMark({
  variant = "hexari",
}: {
  variant?: "hexari" | "forge";
}) {
  return (
    <svg
      className={`brand-mark brand-mark--${variant}`}
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
    >
      <path
        className="brand-mark-outline"
        d="M16 2.5 27.7 9.25v13.5L16 29.5 4.3 22.75V9.25z"
      />
      {variant === "forge" ? (
        <path
          className="brand-mark-detail"
          d="M8 15h16l-2.5 4H18l1 3h2v2H11v-2h2l1-3h-3.5L8 15Zm8-8v5m-2.5-2.5h5"
        />
      ) : (
        <path
          className="brand-mark-detail"
          d="M16 7.5v17M8.65 11.75 16 16l7.35-4.25M8.65 20.25 16 16l7.35 4.25"
        />
      )}
    </svg>
  );
}
