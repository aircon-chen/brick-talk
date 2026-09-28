import BuildView from "@/components/BuildView";

export default async function BuildPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BuildView id={id} />;
}
