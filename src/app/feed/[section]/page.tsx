import { Suspense } from "react";
import { FeedClient } from "./FeedClient";

export default async function FeedSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black px-4 py-10 text-center text-sm text-white/50">
          Загрузка…
        </div>
      }
    >
      <FeedClient section={section} />
    </Suspense>
  );
}
