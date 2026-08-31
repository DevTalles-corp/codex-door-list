import PublicRegistration from "./public-registration";

export default async function RegistrationPage({
  params,
}: PageProps<"/eventos/[id]/registro">) {
  const { id } = await params;

  return <PublicRegistration eventId={id} />;
}
