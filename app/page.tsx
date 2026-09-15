import EventList from "./event-list";

export default function Home() {
  return (
    <main className="landing-shell">
      <header className="landing-header">
        <h1>Próximos eventos</h1>
        <p>Elige una fecha, reserva tu entrada y llega listo para disfrutar.</p>
      </header>
      <EventList />
    </main>
  );
}
