import PrintBooklet from "@/components/PrintBooklet";

export default async function PrintPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const { only, tier } = await searchParams;
  return <PrintBooklet id={id} onlyParts={only === "parts"} tier={typeof tier === "string" ? tier : undefined} />;
}
