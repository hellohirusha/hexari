import BrandMark from "./BrandMark";

export default function ForgeLink() {
  return (
    <a
      className="button ghost forge-link"
      href="/forge"
      target="_blank"
      rel="noopener noreferrer"
    >
      <BrandMark variant="forge" />
      <span>Play forge</span>
      <span aria-hidden="true">↗</span>
    </a>
  );
}
