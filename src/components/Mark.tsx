// Binder's mark: the app icon's tile and page with three binder holes, in the primary
// color of the theme. The same drawing as assets/app-icon.svg, without its margin.
export function Mark(props: { className?: string }) {
  return (
    <svg viewBox="100 100 824 824" aria-hidden className={props.className}>
      <rect
        x="100"
        y="100"
        width="824"
        height="824"
        rx="185.4"
        fill="var(--primary-fill)"
      />
      <rect
        x="256.56"
        y="256.56"
        width="510.88"
        height="510.88"
        rx="85.828"
        fill="var(--primary-foreground)"
      />
      {[386, 512, 638].map((cy) => (
        <circle key={cy} cx="372" cy={cy} r="34" fill="var(--primary-fill)" />
      ))}
    </svg>
  );
}
