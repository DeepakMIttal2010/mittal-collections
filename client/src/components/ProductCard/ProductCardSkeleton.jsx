import Skeleton from "../Skeleton";

function ProductCardSkeleton() {
  return (
    <div className="rounded-xl overflow-hidden bg-white shadow-[0_5px_20px_rgba(0,0,0,0.08)]">
      {/* aspect-square to match ProductCard.css's image rule — a fixed
          h-[280px] here would mismatch the real (now aspect-ratio-based)
          image height on mobile's 2-column grid, shifting the layout the
          moment the skeleton is replaced by the real card. */}
      <Skeleton className="w-full aspect-square rounded-none" />
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
