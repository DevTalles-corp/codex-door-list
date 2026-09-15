export default function TicketLoading() {
  return (
    <main className="ticket-shell" aria-busy="true">
      <p className="visually-hidden" role="status">
        Cargando entrada…
      </p>

      <section className="ticket-card ticket-card-loading" aria-hidden="true">
        <div className="ticket-heading">
          <div className="ticket-loading-heading">
            <span className="skeleton skeleton-compact" />
            <span className="skeleton skeleton-title" />
          </div>
          <span className="skeleton skeleton-compact" />
        </div>

        <div className="ticket-body">
          <div className="ticket-qr">
            <span className="skeleton ticket-qr-skeleton" />
            <span className="skeleton skeleton-secondary ticket-loading-instruction" />
          </div>

          <div className="ticket-details ticket-loading-details">
            <div>
              <span className="skeleton skeleton-compact" />
              <span className="skeleton skeleton-primary" />
            </div>
            <div>
              <span className="skeleton skeleton-compact" />
              <span className="skeleton skeleton-secondary" />
            </div>
            <div>
              <span className="skeleton skeleton-compact" />
              <span className="skeleton skeleton-primary" />
            </div>
            <div>
              <span className="skeleton skeleton-compact" />
              <span className="skeleton skeleton-secondary" />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
