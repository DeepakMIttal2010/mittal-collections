import Skeleton from "../Skeleton";

function ProductCardSkeleton() {
  return (
    <div className="rounded-xl overflow-hidden bg-white shadow-[0_5px_20px_rgba(0,0,0,0.08)]">
      <Skeleton className="w-full h-[280px] rounded-none" />
      <div className="p-5">
        <Skeleton className="h-3.5 w-1/3 mb-2.5" />
        <Skeleton className="h-5 w-4/5 mb-3" />
        <Skeleton className="h-4 w-1/4 mb-4" />
        <Skeleton className="h-6 w-1/3" />
      </div>
      <div className="px-5 pb-5">
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>
    </div>
  );
}

export default ProductCardSkeleton;
