import DemoGallery from "@/components/DemoGallery";
import DesignForm from "@/components/DesignForm";
import RecentBuilds from "@/components/RecentBuilds";
import { runPipeline } from "@/core/pipeline";
import { isSizeTier } from "@/core/spec";
import { FIXTURES } from "@/fixtures";

export default async function Home({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const q = await searchParams;
  const initialPrompt = typeof q.prompt === "string" ? q.prompt.slice(0, 300) : "";
  const initialSize = isSizeTier(q.size) ? q.size : "M";
  const initialBudget = typeof q.budget === "string" && /^\d+$/.test(q.budget) ? q.budget : "";
  const demos = FIXTURES.map((f) => {
    const st = runPipeline(f.spec).stats;
    return { id: f.id, key: f.key, name: f.name, title: f.spec.title, bricks: st.bricks, partTypes: st.partTypes, steps: st.steps };
  });
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <section>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">你想用樂高做什麼？</h1>
        <p className="mt-3 max-w-2xl text-zinc-600">
          說出你的點子，我們用真實存在、近期有生產的 LEGO® 零件把它設計出來，列出要買哪些零件，再給你一本可以列印的組裝說明書。
        </p>
        <DesignForm initialPrompt={initialPrompt} initialSize={initialSize} initialBudget={initialBudget} />
      </section>

      <RecentBuilds />

      <section className="mt-10" data-testid="demos">
        <h2 className="text-xl font-semibold">看看範例</h2>
        <DemoGallery demos={demos} />
      </section>
    </main>
  );
}
