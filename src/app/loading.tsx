export default function Loading() {
  return (
    <main aria-busy="true" aria-live="polite">
      <div className="skeleton skeleton-banner" />
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-tabs" />
      <div className="stat-tiles">
        <div className="skeleton skeleton-tile" />
        <div className="skeleton skeleton-tile" />
        <div className="skeleton skeleton-tile" />
      </div>
      <div className="skeleton skeleton-card" />
      <div className="skeleton skeleton-card" />
    </main>
  );
}
