import { Suspense } from "react";
import { ProductClient } from "./ProductClient";

export default async function ProductPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-black px-4 py-10 text-center text-sm text-white/50">
          Загрузка…
        </div>
      }
    >
      <ProductClient productId={productId} />
    </Suspense>
  );
}
